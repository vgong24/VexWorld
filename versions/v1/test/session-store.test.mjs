import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readdir, rename as fsRename, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { SessionStore } from '../src/server/session-store.mjs';
import {
  bindExecutionKernel,
  createChronicle,
  formAuthoritativeResyncReceipt,
  formDeterminismEpoch,
  formPredictedHead,
  formVerifiedHead,
  formWorldInputFrame,
  reconcilePredictedHead,
  sealWorldSnapshot,
  verifyAuthoritativeResyncReceipt
} from '../src/core/chronicle/chronicle.mjs';
import { hashCanonical } from '../src/core/chronicle/canonical.mjs';

function filesystemError(code, message = code) {
  const error = new Error(message);
  error.code = code;
  return error;
}

test('session store enforces one host lease and optimistic state version', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'vexworld-session-'));
  try {
    const store = new SessionStore(directory);
    const a = await store.claimLease('session.test', 'host.a', { now: 1000, ttlMs: 1000 });
    assert.equal(a.accepted, true);
    const b = await store.claimLease('session.test', 'host.b', { now: 1500, ttlMs: 1000 });
    assert.equal(b.accepted, false);
    const write = await store.writeCheckpoint('session.test', 'host.a', 0, { hello: 'world' }, { now: 1600 });
    assert.equal(write.accepted, true);
    assert.equal(write.stateVersion, 1);
    const stale = await store.writeCheckpoint('session.test', 'host.a', 0, { hello: 'stale' }, { now: 1700 });
    assert.equal(stale.reason, 'VERSION_CONFLICT');
    const takeover = await store.claimLease('session.test', 'host.b', { now: 2200, ttlMs: 1000 });
    assert.equal(takeover.accepted, true);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('observations, intents, and utterances preserve independent monotonic sequences', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'vexworld-relay-'));
  try {
    const store = new SessionStore(directory);
    assert.equal((await store.putObservation('s', 'participant.vex', { sequence: 2 })).accepted, true);
    assert.equal((await store.putObservation('s', 'participant.vex', { sequence: 1 })).accepted, false);
    assert.equal((await store.putIntent('s', 'participant.vex', { sequence: 4 })).accepted, true);
    assert.equal((await store.putIntent('s', 'participant.vex', { sequence: 4 })).accepted, false);
    assert.equal((await store.putUtterance('s', 'participant.vex', { sequence: 1, text: 'hello' })).accepted, true);
    assert.equal((await store.putUtterance('s', 'participant.vex', { sequence: 1, text: 'stale' })).accepted, false);
    assert.equal((await store.putUtterance('s', 'participant.vex', { sequence: 2, text: 'next' })).accepted, true);
    const record = await store.read('s');
    assert.equal(record.intents['participant.vex'].sequence, 4);
    assert.equal(record.utterances['participant.vex'].sequence, 2);
    assert.equal(record.utterances['participant.vex'].text, 'next');
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('legacy session records are read with an empty utterance collection without rewriting them', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'vexworld-session-legacy-'));
  try {
    const store = new SessionStore(directory);
    await store.write({
      schemaVersion: 'vexworld.session/v1',
      sessionRef: 'legacy',
      stateVersion: 0,
      checkpoint: null,
      hostLease: null,
      observations: {},
      intents: {},
      workers: {},
      updatedAt: 1
    });
    const record = await store.read('legacy');
    assert.deepEqual(record.utterances, {});
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('Windows transient replace denial retries only the same rename and commits one logical mutation', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'vexworld-win-replace-'));
  try {
    let renameCalls = 0;
    const observedDelays = [];
    const store = new SessionStore(directory, {
      platform: 'win32',
      windowsReplaceRetryDelaysMs: [1, 2, 3],
      sleep: async (delayMs) => { observedDelays.push(delayMs); },
      rename: async (temporary, destination) => {
        renameCalls += 1;
        if (renameCalls <= 2) throw filesystemError('EPERM', 'simulated transient Windows replace denial');
        return fsRename(temporary, destination);
      }
    });

    const result = await store.putIntent(
      'session.retry-success',
      'participant.vex',
      { sequence: 1, actionRef: 'action.vexworld.test' },
      { now: 4242 }
    );

    assert.equal(result.accepted, true);
    assert.equal(renameCalls, 3);
    assert.deepEqual(observedDelays, [1, 2]);

    const record = await store.read('session.retry-success');
    assert.equal(record.intents['participant.vex'].sequence, 1);
    assert.equal(record.intents['participant.vex'].relayedAt, 4242);
    assert.equal(record.updatedAt, 4242);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('Windows EBUSY replace denial is in the same bounded transient family', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'vexworld-win-ebusy-'));
  try {
    let renameCalls = 0;
    const store = new SessionStore(directory, {
      platform: 'win32',
      windowsReplaceRetryDelaysMs: [0],
      sleep: async () => {},
      rename: async (temporary, destination) => {
        renameCalls += 1;
        if (renameCalls === 1) throw filesystemError('EBUSY', 'simulated sharing violation');
        return fsRename(temporary, destination);
      }
    });

    assert.equal((await store.heartbeat('session.ebusy', 'participant.vex', { controller: 'deterministic' }, { now: 55 })).accepted, true);
    assert.equal(renameCalls, 2);
    assert.equal((await store.read('session.ebusy')).workers['participant.vex'].lastSeenAt, 55);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('persistent Windows replace denial fails closed and preserves the last valid destination', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'vexworld-win-exhaust-'));
  try {
    const baseline = new SessionStore(directory);
    assert.equal((await baseline.putIntent('session.exhaust', 'participant.vex', { sequence: 1 }, { now: 100 })).accepted, true);

    let renameCalls = 0;
    const failing = new SessionStore(directory, {
      platform: 'win32',
      windowsReplaceRetryDelaysMs: [0, 0],
      sleep: async () => {},
      rename: async () => {
        renameCalls += 1;
        throw filesystemError('EPERM', 'simulated persistent Windows replace denial');
      }
    });

    await assert.rejects(
      failing.putIntent('session.exhaust', 'participant.vex', { sequence: 2 }, { now: 200 }),
      (error) => error?.code === 'EPERM'
    );
    assert.equal(renameCalls, 3, 'initial attempt plus two bounded retries');

    const persisted = await baseline.read('session.exhaust');
    assert.equal(persisted.intents['participant.vex'].sequence, 1);
    assert.equal(persisted.updatedAt, 100);

    const files = await readdir(directory);
    assert.deepEqual(files.filter((name) => name.endsWith('.tmp')), []);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('non-transient replace errors fail immediately without Windows retry', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'vexworld-win-nontransient-'));
  try {
    let renameCalls = 0;
    const store = new SessionStore(directory, {
      platform: 'win32',
      windowsReplaceRetryDelaysMs: [0, 0, 0],
      sleep: async () => { throw new Error('sleep must not run for EACCES'); },
      rename: async () => {
        renameCalls += 1;
        throw filesystemError('EACCES', 'simulated real permission defect');
      }
    });

    await assert.rejects(
      store.putObservation('session.permission', 'participant.vex', { sequence: 1 }, { now: 300 }),
      (error) => error?.code === 'EACCES'
    );
    assert.equal(renameCalls, 1);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});


function rollbackKernelFixture() {
  function reducer(state, inputFrame) {
    state.tick = inputFrame.tick;
    for (let index = 0; index < inputFrame.humanActionIntents.length; index += 1) {
      state.value += inputFrame.humanActionIntents[index].delta;
    }
    return state;
  }
  return bindExecutionKernel({
    kernelRef: 'kernel.vexworld.rollback-store-proof.v1',
    reducerSource: Function.prototype.toString.call(reducer),
    bindings: {}
  });
}

function rollbackEpochFixture(kernel) {
  return formDeterminismEpoch({
    epochRef: 'epoch.vexworld.rollback-store-proof.v1',
    worldPackageFingerprint: 'a'.repeat(64),
    kernelRef: kernel.kernelRef,
    kernelSha256: kernel.kernelSha256,
    stateSchemaVersion: 'fixture.rollback-store-state/v1',
    fixedStepMs: 1000 / 60,
    numericProfileRef: 'numeric.rollback-store.integer.v1',
    rootSeed: 7,
    rngStreamRefs: ['rng.rollback']
  });
}

function rollbackFrameFixture(branchRef, tick, delta) {
  return formWorldInputFrame({
    branchRef,
    tick,
    humanActionIntents: [{
      actionRef: `action.rollback.delta.${tick}.${delta < 0 ? 'minus' : 'plus'}`,
      kind: 'DELTA',
      delta
    }],
    companionIntents: [],
    scheduledWorldEvents: [],
    motionWindowRefs: [],
    rngStateByStream: { 'rng.rollback': tick + 100 }
  });
}

test('local prediction never becomes authoritative until the current lease holder wins exact-version checkpoint write', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'vexworld-rollback-resync-'));
  try {
    const store = new SessionStore(directory);
    const sessionRef = 'session.rollback-resync';
    const seedHost = 'host.seed';
    const authoritativeHost = 'host.authoritative';
    const foreignHost = 'host.foreign';

    const kernel = rollbackKernelFixture();
    const determinismEpoch = rollbackEpochFixture(kernel);
    const verifiedBranchRef = 'worldline.rollback-resync.verified';
    const predictionBranchRef = 'worldline.rollback-resync.prediction';
    const sourceChronicle = createChronicle({
      timelineRef: 'timeline.rollback-resync.0001',
      branchRef: verifiedBranchRef,
      epoch: determinismEpoch
    });
    const initialState = {
      schemaVersion: 'fixture.rollback-store-state/v1',
      tick: 0,
      value: 0
    };
    const snapshot = sealWorldSnapshot({
      chronicle: sourceChronicle,
      tick: 0,
      canonicalState: initialState
    });

    const seedLease = await store.claimLease(sessionRef, seedHost, { now: 1000, ttlMs: 5000 });
    assert.equal(seedLease.accepted, true);
    const seeded = await store.writeCheckpoint(
      sessionRef,
      seedHost,
      0,
      initialState,
      { now: 1001 }
    );
    assert.equal(seeded.accepted, true);
    assert.equal(seeded.stateVersion, 1);
    assert.equal((await store.releaseLease(sessionRef, seedHost, { now: 1002 })).accepted, true);

    const verifiedHead = formVerifiedHead({
      sessionRef,
      stateVersion: seeded.stateVersion,
      chronicle: sourceChronicle,
      snapshot
    });

    const prediction = formPredictedHead({
      verifiedHead,
      snapshot,
      sourceChronicle,
      epoch: determinismEpoch,
      predictionBranchRef,
      inputFrames: [rollbackFrameFixture(predictionBranchRef, 1, 1)],
      executionKernel: kernel
    });
    assert.equal(prediction.predictedHead.authorityClass, 'LOCAL_SPECULATION_ONLY');

    const afterPrediction = await store.read(sessionRef);
    assert.equal(afterPrediction.stateVersion, 1, 'local prediction must not advance accepted stateVersion');
    assert.deepEqual(afterPrediction.checkpoint, initialState, 'local prediction must not mutate accepted checkpoint');

    const authoritativeFrames = [rollbackFrameFixture(verifiedBranchRef, 1, 2)];
    const reconciliation = reconcilePredictedHead({
      predictedHead: prediction.predictedHead,
      verifiedHead,
      snapshot,
      sourceChronicle,
      epoch: determinismEpoch,
      authoritativeBranchRef: verifiedBranchRef,
      authoritativeInputFrames: authoritativeFrames,
      executionKernel: kernel
    });
    assert.equal(reconciliation.rollbackReceipt.mode, 'DIVERGENT_ROLLBACK');
    assert.equal(reconciliation.authoritativeReplay.finalState.value, 2);

    const lease = await store.claimLease(sessionRef, authoritativeHost, { now: 2000, ttlMs: 5000 });
    assert.equal(lease.accepted, true);
    assert.ok(lease.lease.generation >= 1);

    const foreignClaim = await store.claimLease(sessionRef, foreignHost, { now: 2001, ttlMs: 5000 });
    assert.equal(foreignClaim.accepted, false);
    assert.equal(foreignClaim.reason, 'LEASE_HELD');

    const foreignWrite = await store.writeCheckpoint(
      sessionRef,
      foreignHost,
      verifiedHead.stateVersion,
      reconciliation.authoritativeReplay.finalState,
      { now: 2002 }
    );
    assert.equal(foreignWrite.accepted, false);
    assert.equal(foreignWrite.reason, 'VALID_HOST_LEASE_REQUIRED');

    const staleWrite = await store.writeCheckpoint(
      sessionRef,
      authoritativeHost,
      verifiedHead.stateVersion - 1,
      reconciliation.authoritativeReplay.finalState,
      { now: 2003 }
    );
    assert.equal(staleWrite.accepted, false);
    assert.equal(staleWrite.reason, 'VERSION_CONFLICT');

    const acceptedWrite = await store.writeCheckpoint(
      sessionRef,
      authoritativeHost,
      verifiedHead.stateVersion,
      reconciliation.authoritativeReplay.finalState,
      { now: 2004 }
    );
    assert.equal(acceptedWrite.accepted, true);
    assert.equal(acceptedWrite.stateVersion, verifiedHead.stateVersion + 1);

    const checkpointSha256 = hashCanonical(reconciliation.authoritativeReplay.finalState);
    assert.equal(checkpointSha256, reconciliation.rollbackReceipt.reconciledStateSha256);

    const resyncReceipt = formAuthoritativeResyncReceipt({
      verifiedHead,
      rollbackReceipt: reconciliation.rollbackReceipt,
      hostId: authoritativeHost,
      hostLeaseGeneration: lease.lease.generation,
      expectedStateVersion: verifiedHead.stateVersion,
      acceptedStateVersion: acceptedWrite.stateVersion,
      acceptedCheckpointSha256: checkpointSha256
    });
    verifyAuthoritativeResyncReceipt(resyncReceipt, {
      verifiedHead,
      rollbackReceipt: reconciliation.rollbackReceipt
    });

    const authoritativeRecord = await store.read(sessionRef);
    assert.equal(authoritativeRecord.stateVersion, resyncReceipt.acceptedStateVersion);
    assert.deepEqual(authoritativeRecord.checkpoint, reconciliation.authoritativeReplay.finalState);

    assert.equal((await store.releaseLease(sessionRef, authoritativeHost, { now: 2005 })).accepted, true);
    const afterReleaseWrite = await store.writeCheckpoint(
      sessionRef,
      authoritativeHost,
      acceptedWrite.stateVersion,
      { ...reconciliation.authoritativeReplay.finalState, value: 99 },
      { now: 2006 }
    );
    assert.equal(afterReleaseWrite.accepted, false);
    assert.equal(afterReleaseWrite.reason, 'VALID_HOST_LEASE_REQUIRED');
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
