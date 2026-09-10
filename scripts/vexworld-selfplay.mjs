#!/usr/bin/env node
/** Resolve the current VexWorld version and run its source-owned self-play. */
import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const pointer = JSON.parse(
  await readFile(resolve(root, 'config/current-version.json'), 'utf8'),
);
const relative =
  pointer.path || pointer.versionPath || pointer.currentVersionPath;
if (typeof relative !== 'string' || !relative.trim()) {
  throw new Error(
    'config/current-version.json does not expose a current version path',
  );
}
const script = resolve(
  root,
  relative,
  'scripts',
  'vex-relay-self-play.mjs',
);
const child = spawn(process.execPath, [script, ...process.argv.slice(2)], {
  cwd: resolve(root, relative),
  stdio: 'inherit',
});
child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exitCode = code ?? 1;
});
