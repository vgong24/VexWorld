import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';

import { npmInvocation } from '../scripts/vexworld-launch.mjs';

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

// [VXG RealForever]
