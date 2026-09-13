import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { compileFirstGrove } from '../src/compiler/world-compiler.mjs';
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
    if (!result.accepted) throw Object.assign(new Error(result.reason), { code: result.reason });
    this.lease = result.lease;
    if (this.stateVersion === null) this.stateVersion = result.stateVersion;
    return result;
  }

  async releaseLease() {
    const result = await this.store.releaseLease(this.sessionRef, this.hostId);
    if (!result.accepted) throw Object.assign(new Error(result.reason), { code: result.reason });
    this.lease = null;
    return result;
  }

  async save(checkpoint) {
    const result = await this.store.writeCheckpoint(this.sessionRef, this.hostId, this.stateVersion, checkpoint);
    if (!result.accepted) throw Object.assign(new Error(result.reason), { code: result.reason });
    this.stateVersion = result.stateVersion;
    return result;
  }
}

async function createLeaseLossFixture(t, sessionRef) {
  const directory = await mkdtemp(path.join(tmpdir(), 'vexworld-headless-lease-loss-'));
  t.after(async () => rm(directory, { recursive: true, force: true }));

  const store = new SessionStore(directory);
  const worldPackage = await compileFirstGrove({ root: versionRoot });
  const state = createInitialGame(worldPackage, {
    sessionRef,
    companions: [{ displayName: 'Vex', controllerClass: 'REMOTE_DETERMINISTIC' }]
  });
  const now = Date.now();
  assert.equal((await store.claimLease(sessionRef, 'host.browser.seed', { now, ttlMs: 5000 })).accepted, true);
  assert.equal((await store.writeCheckpoint(sessionRef, 'host.browser.seed', 0, serializeGameState(state), { now: now + 1 })).accepted, true);
  assert.equal((await store.releaseLease(sessionRef, 'host.browser.seed', { now: now + 2 })).accepted, true);
  return { store, worldPackage, state };
}

test('headless realm stops before another simulation tick when its persisted lease has expired', async (t) => {
  const sessionRef = 'realm.lease-loss';
  const { store, worldPackage, state } = await createLeaseLossFixture(t, sessionRef);

  const hostId = 'host.headless.lease-loss';
  const client = new StoreSessionClient(store, sessionRef, hostId);
  const host = new HeadlessRealmHost({
    client,
    worldPackage,
    hostId,
    maxTicks: 3,
    tickDelayMs: 0,
    saveEveryTicks: 99,
    leaseRenewEveryTicks: 99,
    leaseTtlMs: 60000,
    sleep: async () => {}
  });
  await host.start();
  const tickBeforeLoss = host.state.tick;
  assert.equal(tickBeforeLoss, state.tick);

  const record = await store.read(sessionRef);
  record.hostLease.expiresAt = 0;
  await store.write(record);

  await assert.rejects(host.stepOnce(), (error) => error?.code === 'HOST_LEASE_LOST');
  assert.equal(host.state.tick, tickBeforeLoss, 'no canonical world step may occur after lease loss');
  assert.equal(host.leaseHeld, false);

  const takeover = await store.claimLease(sessionRef, 'host.browser.return', { now: Date.now(), ttlMs: 5000 });
  assert.equal(takeover.accepted, true, 'an expired headless lease must not block explicit later takeover');
});

test('headless realm does not publish companion state after lease replacement following an authorized tick', async (t) => {
  const sessionRef = 'realm.post-step-lease-loss';
  const { store, worldPackage, state } = await createLeaseLossFixture(t, sessionRef);
  const companion = state.party.members.find((member) => member.participantType === 'AI_COMPANION');
  assert.ok(companion);

  const hostId = 'host.headless.post-step-lease-loss';
  const successorHostId = 'host.browser.return-after-step';
  const client = new StoreSessionClient(store, sessionRef, hostId);
  const host = new HeadlessRealmHost({
    client,
    worldPackage,
    hostId,
    maxTicks: 3,
    tickDelayMs: 0,
    saveEveryTicks: 99,
    leaseRenewEveryTicks: 99,
    leaseTtlMs: 60000,
    sleep: async () => {}
  });
  await host.start();
  const persistedTickBeforeLoss = (await store.read(sessionRef)).checkpoint.tick;
  const originalPublish = host.publishCompanionObservations.bind(host);
  host.publishCompanionObservations = async () => {
    assert.equal((await store.releaseLease(sessionRef, hostId)).accepted, true);
    assert.equal((await store.claimLease(sessionRef, successorHostId, { ttlMs: 60000 })).accepted, true);
    return originalPublish();
  };

  await assert.rejects(host.stepOnce(), (error) => error?.code === 'HOST_LEASE_LOST');
  assert.equal(
    host.state.tick,
    persistedTickBeforeLoss + 1,
    'the in-memory canonical tick occurred while the old host still had authority'
  );
  assert.equal(host.leaseHeld, false);
  assert.equal(host.companionObservationsPublished, 0);
  assert.equal(host.companionObservationPublishFailures, 0, 'authority loss is not an observation transport failure');

  const afterLoss = await store.read(sessionRef);
  assert.equal(afterLoss.hostLease?.hostId, successorHostId);
  assert.equal(afterLoss.checkpoint.tick, persistedTickBeforeLoss, 'the losing host must not persist its in-memory tick');
  assert.equal(afterLoss.observations[companion.participantRef], undefined, 'the losing host must not publish observer state');

  await host.stop({ persist: false });
  const afterStop = await store.read(sessionRef);
  assert.equal(afterStop.hostLease?.hostId, successorHostId, 'losing-host cleanup must not release successor authority');
});

// [VXG RealForever]
