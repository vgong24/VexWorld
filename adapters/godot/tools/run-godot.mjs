#!/usr/bin/env node
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { buildAdapter } from './build-adapter.mjs';
import { ensureGodot } from './bootstrap-godot.mjs';

const adapterRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: adapterRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe']
  });
  process.stdout.write(result.stdout || '');
  process.stderr.write(result.stderr || '');
  if (result.status !== 0) throw new Error(`Godot adapter process failed with ${result.status}`);
}

async function main() {
  await buildAdapter();
  const runtime = await ensureGodot();
  await fs.mkdir(path.join(adapterRoot, 'artifacts'), { recursive: true });

  if (process.argv.includes('--smoke')) {
    run(runtime.binary, ['--path', adapterRoot, '--rendering-method', 'gl_compatibility', '--', '--ci-smoke']);
    return;
  }

  run(runtime.binary, [
    '--headless',
    '--path', adapterRoot,
    '--script', 'res://scripts/ci_probe.gd'
  ]);
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
