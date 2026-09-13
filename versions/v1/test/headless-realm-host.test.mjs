import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { runWorkerCycle } from '../src/agents/remote-worker.mjs';
import { compileFirstGrove, sha256 } from '../src/compiler/world-compiler.mjs';
import { FIXED_STEP_MS } from '../src/core/constants.mjs';
import { createInitialGame, serializeGameState } from '../src/core/engine.mjs';
import { canonicalJson } from '../src/core/utils.mjs';
import { HeadlessRealmHost, HeadlessSessionClient } from '../src/server/headless-realm-host.mjs';
import { createVexWorldServer } from '../src/server/server.mjs';
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

  async publishObservation(participantRef, observation) {
    return this.store.putObservation(this.sessionRef, participantRef, observation);
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

function withRecomputedFingerprint(worldPackage) {
  const { integrityFingerprint: _discardedFingerprint, ...packageBody } = structuredClone(worldPackage);
  return {
    ...packageBody,
    integrityFingerprint: sha256(canonicalJson(packageBody))
  };
}

async function assertRealmUntouched(store, expectedTick) {
  const record = await store.read('realm.test');
  assert.equal(record.hostLease, null);
  assert.equal(record.checkpoint.tick, expectedTick);
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
  assert.equal(receipt.companionObservationsPublished, 3);
  assert.equal(receipt.companionObservationPublishFailures, 0);
  assert.equal(receipt.lastCompanionObservationFailure, null);
  assert.equal(receipt.offscreenCompanionObservationSource, 'HEADLESS_CANONICAL_STATE');
  assert.equal(receipt.wallClockCatchUp, false);
  assert.equal(receipt.humanInputFabricated, false);
  assert.equal(receipt.physicalEffectPossible, false);
  assert.equal(receipt.disposition, 'PASS_BOUNDED_HEADLESS_REALM_CONTINUITY');
});

test('headless realm publishes fresh observations through the accepted worker intent and utterance path', async (t) => {
  const { directory, worldPackage, state: initial } = await fixture(t, {
    controllerClass: 'REMOTE_DETERMINISTIC'
  });
  const token = 'stage-03b-test-token';
  const { server, store } = createVexWorldServer({
    host: '127.0.0.1',
    port: 0,
    token,
    dataDirectory: directory
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  t.after(async () => {
    if (server.listening) {
      await new Promise((resolve) => server.close(resolve));
    }
  });
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  const baseUrl = `http://127.0.0.1:${address.port}`;
  const companion = initial.party.members.find((member) => member.participantType === 'AI_COMPANION');
  const hostId = 'host.headless.offscreen-worker';
  const client = new HeadlessSessionClient({
    baseUrl,
    token,
    sessionRef: 'realm.test',
    hostId
  });
  const host = new HeadlessRealmHost({
    client,
    worldPackage,
    hostId,
    maxTicks: 4,
    tickDelayMs: 0,
    saveEveryTicks: 99,
    leaseRenewEveryTicks: 99,
    leaseTtlMs: 60000,
    sleep: async () => {}
  });

  await host.start();
  await host.stepOnce();

  const firstRelay = await store.read('realm.test');
  const observation = firstRelay.observations[companion.participantRef];
  assert.equal(observation.schemaVersion, 'vexworld.companion-observation/v1');
  assert.equal(observation.observerParticipantRef, companion.participantRef);
  assert.equal(observation.sequence, host.state.tick);
  assert.equal(observation.worldRef, host.state.worldRef);
  assert.equal(observation.physicalEffectPossible, false);

  const workerState = await runWorkerCycle({
    server: baseUrl,
    token,
    session: 'realm.test',
    companion: companion.participantRef,
    mode: 'deterministic',
    model: null,
    ollama: 'http://127.0.0.1:11434',
    intervalMs: 900,
    modelTimeoutMs: 5000,
    once: true,
    maxCycles: 1,
    workerId: 'worker.stage-03b.test'
  });
  assert.equal(workerState.processed, true);
  assert.ok(workerState.intent);
  assert.equal(workerState.intent.sourceObservationRef, observation.observationRef);
  assert.ok(workerState.utterance);
  assert.equal(workerState.utterance.sourceObservationRef, observation.observationRef);
  assert.equal(workerState.utterance.sourceIntentRef, workerState.intent.intentRef);

  const relayed = await store.read('realm.test');
  assert.equal(relayed.intents[companion.participantRef].intentRef, workerState.intent.intentRef);
  assert.equal(relayed.utterances[companion.participantRef].utteranceRef, workerState.utterance.utteranceRef);

  await host.stepOnce();
  assert.equal(
    host.state.prototype.controllerObservations[companion.participantRef].intentType,
    workerState.intent.intentType
  );
  assert.equal(host.state.prototype.controllerObservations[companion.participantRef].reason, workerState.intent.reason);

  const secondRelay = await store.read('realm.test');
  assert.equal(secondRelay.observations[companion.participantRef].sequence, host.state.tick);
  assert.ok(
    secondRelay.observations[companion.participantRef].sequence > observation.sequence,
    'headless observations must advance with canonical simulation ticks'
  );

  await host.stop();
  const persisted = await store.read('realm.test');
  assert.equal(persisted.hostLease, null);
  assert.equal(persisted.checkpoint.tick, initial.tick + 2);
  assert.equal(
    persisted.checkpoint.messages.some((message) => message.text === workerState.utterance.text),
    false,
    'ephemeral companion utterance must not become canonical checkpoint memory'
  );
  assert.equal(
    persisted.utterances[companion.participantRef].utteranceRef,
    workerState.utterance.utteranceRef
  );
});

test('offscreen observation relay failure degrades to existing safe controller fallback without stopping the realm', async (t) => {
  const { store, worldPackage, state: initial } = await fixture(t, {
    controllerClass: 'REMOTE_DETERMINISTIC'
  });
  const companion = initial.party.members.find((member) => member.participantType === 'AI_COMPANION');
  const { host, client } = createHost(store, worldPackage, {
    hostId: 'host.headless.observation-relay-failure'
  });
  client.publishObservation = async () => ({
    accepted: false,
    reason: 'TEST_OBSERVATION_RELAY_UNAVAILABLE'
  });

  await host.start();
  await host.stepOnce();

  assert.equal(host.state.tick, initial.tick + 1);
  assert.equal(
    host.state.prototype.controllerObservations[companion.participantRef].reason,
    'REMOTE_STALE_SAFE_FALLBACK'
  );
  const record = await store.read('realm.test');
  assert.equal(record.observations[companion.participantRef], undefined);

  await host.stop();
  const receipt = host.receipt();
  assert.equal(receipt.companionObservationsPublished, 0);
  assert.equal(receipt.companionObservationPublishFailures, 1);
  assert.equal(receipt.lastCompanionObservationFailure, 'OBSERVATION_RELAY_REJECTED');
  assert.equal((await store.read('realm.test')).hostLease, null);
});

test('headless realm host binds canonical World Package integrity and checkpoint identity before taking a lease', async (t) => {
  const { store, worldPackage, state } = await fixture(t);
  const expectedTick = state.tick;

  const tampered = structuredClone(worldPackage);
  tampered.laws.gravity += 0.25;
  const tamperedHost = createHost(store, tampered, { hostId: 'host.headless.tampered-package' }).host;
  await assert.rejects(tamperedHost.start(), (error) => error?.code === 'WORLD_PACKAGE_INTEGRITY_MISMATCH');
  await assertRealmUntouched(store, expectedTick);

  const alternateBody = structuredClone(worldPackage);
  alternateBody.laws.gravity += 0.25;
  const validButDifferentPackage = withRecomputedFingerprint(alternateBody);
  const alternateHost = createHost(store, validButDifferentPackage, { hostId: 'host.headless.package-fingerprint-mismatch' }).host;
  await assert.rejects(alternateHost.start(), (error) => error?.code === 'CHECKPOINT_WORLD_PACKAGE_FINGERPRINT_MISMATCH');
  await assertRealmUntouched(store, expectedTick);

  const alternateWorldBody = structuredClone(worldPackage);
  alternateWorldBody.manifest.worldRef = 'world.vexworld.first-grove.alternate-test';
  const validButDifferentWorld = withRecomputedFingerprint(alternateWorldBody);
  const alternateWorldHost = createHost(store, validButDifferentWorld, { hostId: 'host.headless.world-ref-mismatch' }).host;
  await assert.rejects(alternateWorldHost.start(), (error) => error?.code === 'CHECKPOINT_WORLD_REF_MISMATCH');
  await assertRealmUntouched(store, expectedTick);

  const alternateRefBody = structuredClone(worldPackage);
  alternateRefBody.packageRef = 'package.vexworld.first-grove.alternate-test';
  const validButWrongPackageRef = withRecomputedFingerprint(alternateRefBody);
  const alternateRefHost = createHost(store, validButWrongPackageRef, { hostId: 'host.headless.package-ref-mismatch' }).host;
  await assert.rejects(alternateRefHost.start(), (error) => error?.code === 'WORLD_PACKAGE_REF_MISMATCH');
  await assertRealmUntouched(store, expectedTick);
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
