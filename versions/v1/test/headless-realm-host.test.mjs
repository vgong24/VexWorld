import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { compileFirstGrove } from '../src/compiler/world-compiler.mjs';
import { FIXED_STEP_MS } from '../src/core/constants.mjs';
import { createInitialGame, serializeGameState } from '../src/core/engine.mjs';
import { HeadlessRealmHost } from '../src/server/headless-realm-host.mjs';
import { SessionStore } from '../src/server/session-store.mjs';

const versionRoot = fileURLToPath(new URL('../', import.meta.url));

class StoreSessionClient {
  constructor(store, sessionRef, hostId) {
    this.store = store;
    this.sessionRef = sessionRef;
    this.hostId = hostId;
    this.stateVersion = null;
    this.lease = null;
  }

  async load({ trackVersion = true } = {}) {
    const record = await this.store.read(this.sessionRef);
    if (trackVersion) this.stateVersion = record.stateVersion;
    this.lease = record.hostLease;
    return record;
  }

  async claimLease({ ttlMs = 15000 } = {}) {
    const result = await this.store.claimLease(this.sessionRef, this.hostId, { ttlMs });
    if (!result.accepted) throw Object.assign(new Error(result.reason), { code: result.reason, payload: result });
    this.lease = result.lease;
    if (this.stateVersion === null) this.stateVersion = result.stateVersion;
    return result;
  }

  async releaseLease() {
    const result = await this.store.releaseLease(this.sessionRef, this.hostId);
    if (!result.accepted) throw Object.assign(new Error(result.reason), { code: result.reason, payload: result });
    this.lease = null;
    return result;
  }

  async save(checkpoint) {
    const result = await this.store.writeCheckpoint(
      this.sessionRef,
      this.hostId,
      this.stateVersion,
      checkpoint
    );
    if (!result.accepted) throw Object.assign(new Error(result.reason), { code: result.reason, payload: result });
    this.stateVersion = result.stateVersion;
    return result;
  }
}

async function fixture(t, { controllerClass = 'REMOTE_DETERMINISTIC', paused = false } = {}) {
  const directory = await mkdtemp(path.join(tmpdir(), 'vexworld-headless-realm-'));
  t.after(async () => rm(directory, { recursive: true, force: true }));
  const store = new SessionStore(directory);
  const worldPackage = await compileFirstGrove({ root: versionRoot });
  const state = createInitialGame(worldPackage, {
    sessionRef: 'realm.test',
    companions: [{ displayName: 'Vex', controllerClass }]
  });
  state.flags.paused = paused;
  const now = Date.now();
  const seedHost = 'host.browser.seed';
  assert.equal((await store.claimLease('realm.test', seedHost, { now, ttlMs: 5000 })).accepted, true);
  assert.equal((await store.writeCheckpoint('realm.test', seedHost, 0, serializeGameState(state), { now: now + 1 })).accepted, true);
  assert.equal((await store.releaseLease('realm.test', seedHost, { now: now + 2 })).accepted, true);
  return { directory, store, worldPackage, state };
}

function createHost(store, worldPackage, options = {}) {
  const hostId = options.hostId || 'host.headless.test';
  const client = new StoreSessionClient(store, 'realm.test', hostId);
  const host = new HeadlessRealmHost({
    client,
    worldPackage,
    hostId,
    maxTicks: options.maxTicks || 12,
    tickDelayMs: 0,
    saveEveryTicks: options.saveEveryTicks || 99,
    leaseRenewEveryTicks: options.leaseRenewEveryTicks || 99,
    leaseTtlMs: 60000,
    resumePaused: options.resumePaused || false,
    sleep: async () => {}
  });
  return { host, client, hostId };
}

test('headless realm host owns one lease, advances a bounded world clock, and never fabricates human input', async (t) => {
  const { store, worldPackage, state: initial } = await fixture(t);
  const { host, hostId } = createHost(store, worldPackage);
  const humanRef = initial.party.members.find((member) => member.participantType === 'HUMAN').participantRef;
  const humanX = initial.party.members.find((member) => member.participantRef === humanRef).body.x;

  await host.start();
  const competitor = await store.claimLease('realm.test', 'host.browser.competing', { ttlMs: 60000 });
  assert.equal(competitor.accepted, false);
  assert.equal(competitor.reason, 'LEASE_HELD');
  assert.equal((await store.read('realm.test')).hostLease.hostId, hostId);

  await host.stepOnce();
  await host.stepOnce();
  await host.stepOnce();

  const human = host.state.party.members.find((member) => member.participantRef === humanRef);
  assert.equal(human.body.x, humanX, 'camera absence must not fabricate horizontal human movement');
  assert.equal(host.state.tick, initial.tick + 3);
  assert.ok(Math.abs((host.state.nowMs - initial.nowMs) - (3 * FIXED_STEP_MS)) < 0.0001);

  await host.stop();
  const persisted = await store.read('realm.test');
  assert.equal(persisted.hostLease, null);
  assert.equal(persisted.checkpoint.tick, initial.tick + 3);
  assert.equal(persisted.stateVersion, 2);

  const receipt = host.receipt();
  assert.equal(receipt.hostClass, 'HEADLESS_REALM_HOST');
  assert.equal(receipt.participantIdentityClaimed, false);
  assert.equal(receipt.wallClockCatchUp, false);
  assert.equal(receipt.humanInputFabricated, false);
  assert.equal(receipt.physicalEffectPossible, false);
  assert.equal(receipt.disposition, 'PASS_BOUNDED_HEADLESS_REALM_CONTINUITY');
});

test('paused checkpoints require an explicit offscreen resume decision', async (t) => {
  const { store, worldPackage } = await fixture(t, { paused: true });
  const blocked = createHost(store, worldPackage, { hostId: 'host.headless.paused-blocked' }).host;
  await assert.rejects(blocked.start(), (error) => error?.code === 'PAUSED_CHECKPOINT_REQUIRES_EXPLICIT_RESUME');
  assert.equal((await store.read('realm.test')).hostLease, null);

  const allowed = createHost(store, worldPackage, { hostId: 'host.headless.paused-explicit', resumePaused: true }).host;
  await allowed.start();
  assert.equal(allowed.state.flags.paused, false);
  await allowed.stop({ persist: false });
  assert.equal((await store.read('realm.test')).hostLease, null);
});

test('existing remote intents keep their current validation/expiry boundary while the realm is offscreen', async (t) => {
  const { store, worldPackage, state } = await fixture(t, { controllerClass: 'REMOTE_DETERMINISTIC' });
  const companion = state.party.members.find((member) => member.participantType === 'AI_COMPANION');
  const now = Date.now();
  assert.equal((await store.putIntent('realm.test', companion.participantRef, {
    schemaVersion: 'vexworld.companion-intent/v1',
    participantRef: companion.participantRef,
    intentType: 'EXPLORE_RIGHT',
    targetRef: null,
    reason: 'TEST_VALID_REMOTE_INTENT',
    sequence: 1,
    formedAt: now,
    expiresAt: now + 60000
  }, { now })).accepted, true);

  const { host } = createHost(store, worldPackage, { hostId: 'host.headless.remote-intent' });
  await host.start();
  await host.stepOnce();
  assert.equal(host.state.prototype.controllerObservations[companion.participantRef].intentType, 'EXPLORE_RIGHT');

  assert.equal((await store.putIntent('realm.test', companion.participantRef, {
    schemaVersion: 'vexworld.companion-intent/v1',
    participantRef: companion.participantRef,
    intentType: 'EXPLORE_LEFT',
    targetRef: null,
    reason: 'TEST_EXPIRED_REMOTE_INTENT',
    sequence: 2,
    formedAt: now - 2000,
    expiresAt: now - 1000
  }, { now: now + 1 })).accepted, true);
  await host.stepOnce();
  assert.equal(host.state.prototype.controllerObservations[companion.participantRef].reason, 'REMOTE_STALE_SAFE_FALLBACK');
  await host.stop();
});

test('checkpoint version drift fails closed rather than becoming silent last-write-wins', async (t) => {
  const { store, worldPackage } = await fixture(t);
  const { host, client, hostId } = createHost(store, worldPackage, { hostId: 'host.headless.version-conflict' });
  await host.start();
  await host.stepOnce();

  const external = structuredClone(host.state);
  external.messages.push({ speaker: 'Test', text: 'authoritative competing same-host fixture', at: external.nowMs });
  const externalWrite = await store.writeCheckpoint('realm.test', hostId, client.stateVersion, serializeGameState(external));
  assert.equal(externalWrite.accepted, true);

  await assert.rejects(host.persist(), (error) => error?.code === 'VERSION_CONFLICT');
  await host.stop({ persist: false });
  const persisted = await store.read('realm.test');
  assert.match(persisted.checkpoint.messages.at(-1).text, /authoritative competing/);
  assert.equal(persisted.hostLease, null);
});

test('headless host refuses a session without an accepted checkpoint before taking a lease', async (t) => {
  const directory = await mkdtemp(path.join(tmpdir(), 'vexworld-headless-empty-'));
  t.after(async () => rm(directory, { recursive: true, force: true }));
  const store = new SessionStore(directory);
  const worldPackage = await compileFirstGrove({ root: versionRoot });
  const { host } = createHost(store, worldPackage, { hostId: 'host.headless.no-checkpoint' });
  await assert.rejects(host.start(), (error) => error?.code === 'CHECKPOINT_REQUIRED');
  assert.equal((await store.read('realm.test')).hostLease, null);
});

// [VXG RealForever]
