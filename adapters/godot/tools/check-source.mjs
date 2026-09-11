#!/usr/bin/env node
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const adapterRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = path.resolve(adapterRoot, '../..');

const required = [
  'project.godot',
  'ENGINE-RECEIPT.json',
  'config/action-bindings.json',
  'scenes/main.tscn',
  'scripts/main.gd',
  'scripts/vessel.gd',
  'scripts/world_entity.gd',
  'scripts/ci_probe.gd',
  'tools/build-adapter.mjs',
  'tools/bootstrap-godot.mjs',
  'tools/run-godot.mjs'
];
const forbiddenExtensions = new Set(['.png', '.jpg', '.jpeg', '.webp', '.svg', '.glb', '.gltf', '.fbx', '.blend', '.wav', '.ogg', '.mp3']);

async function walk(directory, relative = '') {
  const output = [];
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    if (['.runtime', 'generated', 'artifacts', 'node_modules'].includes(entry.name)) continue;
    const next = relative ? `${relative}/${entry.name}` : entry.name;
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) output.push(...await walk(absolute, next));
    else if (entry.isFile()) output.push(next);
  }
  return output;
}

export async function checkSource() {
  const errors = [];
  for (const relative of required) {
    try { await fs.access(path.join(adapterRoot, relative)); }
    catch { errors.push(`missing adapter source ${relative}`); }
  }

  const engine = JSON.parse(await fs.readFile(path.join(adapterRoot, 'ENGINE-RECEIPT.json'), 'utf8'));
  if (engine.releaseTag !== '4.7.2-stable') errors.push('engine receipt must pin 4.7.2-stable');
  if (engine.sourceCommit !== 'ed1daf0bf001b61586d9930840f2f1394092c079') errors.push('engine receipt source commit mismatch');
  if (engine.licenseIdentifier !== 'MIT') errors.push('engine receipt must preserve MIT license identity');
  if (engine.engineBinaryVendored !== false) errors.push('engine binary must not be vendored');
  if (engine.permanentOrExclusiveAdoption !== false) errors.push('bounded proof must not claim permanent/exclusive adoption');

  const bindings = JSON.parse(await fs.readFile(path.join(adapterRoot, 'config/action-bindings.json'), 'utf8'));
  if (!bindings.bindings?.some((binding) => binding.actionRef === 'action.vexworld.status.open')) {
    errors.push('semantic status action binding is required');
  }
  for (const binding of bindings.bindings ?? []) {
    if (!binding.actionRef?.startsWith('action.vexworld.')) errors.push(`non-semantic actionRef ${binding.actionRef}`);
    if (!binding.engineAction?.startsWith('vw_')) errors.push(`engine action should remain adapter-local: ${binding.engineAction}`);
  }

  const files = await walk(adapterRoot);
  for (const file of files) {
    if (forbiddenExtensions.has(path.extname(file).toLowerCase())) {
      errors.push(`Stage B forbids imported visual/audio asset ${file}`);
    }
  }

  const main = await fs.readFile(path.join(adapterRoot, 'scripts/main.gd'), 'utf8');
  if (!main.includes('set_meta("vexworld_ref"')) {
    errors.push('Godot realization must carry semantic refs as metadata');
  }
  if (!main.includes('first-grove.world-package.json')) {
    errors.push('Godot realization must consume generated World Package');
  }

  const packagePath = path.join(repoRoot, 'versions/v1/package.json');
  try { await fs.access(packagePath); } catch { errors.push('current Version 1 source is missing'); }

  return { disposition: errors.length ? 'ATTENTION_REQUIRED' : 'SOURCE_BOUNDARY_VALID', errors, files };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  checkSource().then((receipt) => {
    console.log(JSON.stringify(receipt, null, 2));
    if (receipt.errors.length) process.exitCode = 2;
  }).catch((error) => {
    console.error(error.stack || error.message);
    process.exitCode = 1;
  });
}
