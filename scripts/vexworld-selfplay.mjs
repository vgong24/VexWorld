#!/usr/bin/env node
/** Resolve the current VexWorld version and run its source-owned self-play. */
import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export function resolveCurrentVersionSourcePath(pointer) {
  const relative =
    pointer?.sourcePath ||
    pointer?.path ||
    pointer?.versionPath ||
    pointer?.currentVersionPath;
  if (typeof relative !== 'string' || !relative.trim()) {
    throw new Error(
      'config/current-version.json does not expose a current version source path',
    );
  }
  return relative.trim();
}

export async function runCurrentVersionSelfPlay({
  root = resolve(dirname(fileURLToPath(import.meta.url)), '..'),
  args = process.argv.slice(2),
} = {}) {
  const pointer = JSON.parse(
    await readFile(resolve(root, 'config/current-version.json'), 'utf8'),
  );
  const relative = resolveCurrentVersionSourcePath(pointer);
  const script = resolve(
    root,
    relative,
    'scripts',
    'vex-relay-self-play.mjs',
  );
  const child = spawn(process.execPath, [script, ...args], {
    cwd: resolve(root, relative),
    stdio: 'inherit',
  });
  child.on('exit', (code, signal) => {
    if (signal) process.kill(process.pid, signal);
    process.exitCode = code ?? 1;
  });
  return child;
}

const invokedDirectly =
  process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (invokedDirectly) {
  runCurrentVersionSelfPlay().catch((error) => {
    console.error(error.stack ?? error.message);
    process.exitCode = 1;
  });
}
