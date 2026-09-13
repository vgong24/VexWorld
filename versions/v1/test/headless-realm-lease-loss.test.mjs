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

test('headless realm stops before another simulation tick when its persisted lease has expired', async (t) => {
  const directory = await mkdtemp(path.join(tmpdir(), 'vexworld-headless-lease-loss-'));
  t.after(async () => rm(directory, { recursive: true, force: true }));

  const store = new SessionStore(directory);
  const worldPackage = await compileFirstGrove({ root: versionRoot });
  const state = createInitialGame(worldPackage, {
    sessionRef: 'realm.lease-loss',
    companions: [{ displayName: 'Vex', controllerClass: 'REMOTE_DETERMINISTIC' }]
  });
  const now = Date.now();
  assert.equal((await store.claimLease('realm.lease-loss', 'host.browser.seed', { now, ttlMs: 5000 })).accepted, true);
  assert.equal((await store.writeCheckpoint('realm.lease-loss', 'host.browser.seed', 0, serializeGameState(state), { now: now + 1 })).accepted, true);
  assert.equal((await store.releaseLease('realm.lease-loss', 'host.browser.seed', { now: now + 2 })).accepted, true);

  const hostId = 'host.headless.lease-loss';
  const client = new StoreSessionClient(store, 'realm.lease-loss', hostId);
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

  const record = await store.read('realm.lease-loss');
  record.hostLease.expiresAt = 0;
  await store.write(record);

  await assert.rejects(host.stepOnce(), (error) => error?.code === 'HOST_LEASE_LOST');
  assert.equal(host.state.tick, tickBeforeLoss, 'no canonical world step may occur after lease loss');
  assert.equal(host.leaseHeld, false);

  const takeover = await store.claimLease('realm.lease-loss', 'host.browser.return', { now: Date.now(), ttlMs: 5000 });
  assert.equal(takeover.accepted, true, 'an expired headless lease must not block explicit later takeover');
});

// [VXG RealForever]
