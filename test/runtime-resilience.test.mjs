import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { npmInvocation } from '../scripts/vexworld-launch.mjs';
import { SessionStore } from '../versions/v1/src/server/session-store.mjs';

test('Windows root launcher invokes npm through Node rather than spawning npm.cmd or enabling a shell', () => {
  const execPath = 'C:\\Program Files\\nodejs\\node.exe';
  const npmCli = 'C:\\Program Files\\nodejs\\node_modules\\npm\\bin\\npm-cli.js';
  const invocation = npmInvocation({
    platform: 'win32',
    execPath,
    env: { npm_execpath: npmCli }
  });

  assert.equal(invocation.executable, execPath);
  assert.deepEqual(invocation.prefixArgs, [npmCli]);
  assert.equal(invocation.shell, false);
  assert.equal(invocation.strategy, 'NODE_NPM_CLI_FROM_ENV');
  assert.equal(invocation.executable.toLowerCase().endsWith('.cmd'), false);
});

test('direct Windows launcher has a Node-adjacent npm CLI fallback without shell execution', () => {
  const execPath = 'C:\\Node\\node.exe';
  const invocation = npmInvocation({ platform: 'win32', execPath, env: {} });

  assert.equal(invocation.executable, execPath);
  assert.equal(invocation.prefixArgs.length, 1);
  assert.equal(invocation.prefixArgs[0], path.win32.join('C:\\Node', 'node_modules', 'npm', 'bin', 'npm-cli.js'));
  assert.equal(invocation.shell, false);
  assert.equal(invocation.strategy, 'NODE_ADJACENT_NPM_CLI');
});

test('non-Windows launcher remains shell-free when npm CLI provenance is observed', () => {
  const invocation = npmInvocation({
    platform: 'darwin',
    execPath: '/usr/local/bin/node',
    env: { npm_execpath: '/usr/local/lib/node_modules/npm/bin/npm-cli.js' }
  });
  assert.equal(invocation.executable, '/usr/local/bin/node');
  assert.equal(invocation.shell, false);
  assert.equal(invocation.strategy, 'NODE_NPM_CLI_FROM_ENV');
});

test('checkpoint conflict and lease takeover fail closed before bounded recovery', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'vexworld-runtime-recovery-'));
  try {
    const store = new SessionStore(directory);
    const firstLease = await store.claimLease('session.recovery', 'host.a', { now: 1000, ttlMs: 1000 });
    assert.equal(firstLease.accepted, true);

    const firstWrite = await store.writeCheckpoint(
      'session.recovery',
      'host.a',
      0,
      { marker: 'accepted-a' },
      { now: 1100 }
    );
    assert.equal(firstWrite.accepted, true);
    assert.equal(firstWrite.stateVersion, 1);

    const staleWrite = await store.writeCheckpoint(
      'session.recovery',
      'host.a',
      0,
      { marker: 'must-not-win' },
      { now: 1200 }
    );
    assert.equal(staleWrite.accepted, false);
    assert.equal(staleWrite.reason, 'VERSION_CONFLICT');

    const afterConflict = await store.read('session.recovery');
    assert.equal(afterConflict.stateVersion, 1);
    assert.equal(afterConflict.checkpoint.marker, 'accepted-a');

    const prematureTakeover = await store.claimLease('session.recovery', 'host.b', { now: 1500, ttlMs: 1000 });
    assert.equal(prematureTakeover.accepted, false);
    assert.equal(prematureTakeover.reason, 'LEASE_HELD');

    const takeover = await store.claimLease('session.recovery', 'host.b', { now: 2101, ttlMs: 1000 });
    assert.equal(takeover.accepted, true);

    const staleHostWrite = await store.writeCheckpoint(
      'session.recovery',
      'host.a',
      1,
      { marker: 'must-not-return' },
      { now: 2200 }
    );
    assert.equal(staleHostWrite.accepted, false);
    assert.equal(staleHostWrite.reason, 'VALID_HOST_LEASE_REQUIRED');

    const resumed = await store.writeCheckpoint(
      'session.recovery',
      'host.b',
      1,
      { marker: 'accepted-b' },
      { now: 2250 }
    );
    assert.equal(resumed.accepted, true);
    assert.equal(resumed.stateVersion, 2);

    const finalRecord = await store.read('session.recovery');
    assert.equal(finalRecord.stateVersion, 2);
    assert.equal(finalRecord.checkpoint.marker, 'accepted-b');
    assert.equal(finalRecord.hostLease.hostId, 'host.b');
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

// [VXG RealForever]
