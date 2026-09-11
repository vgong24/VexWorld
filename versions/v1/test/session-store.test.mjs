import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readdir, rename as fsRename, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { SessionStore } from '../src/server/session-store.mjs';

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

test('observations and intents preserve monotonic sequence', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'vexworld-relay-'));
  try {
    const store = new SessionStore(directory);
    assert.equal((await store.putObservation('s', 'participant.vex', { sequence: 2 })).accepted, true);
    assert.equal((await store.putObservation('s', 'participant.vex', { sequence: 1 })).accepted, false);
    assert.equal((await store.putIntent('s', 'participant.vex', { sequence: 1 })).accepted, true);
    assert.equal((await store.putIntent('s', 'participant.vex', { sequence: 1 })).accepted, false);
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
