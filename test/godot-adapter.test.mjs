import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const adapter = path.join(root, 'adapters', 'godot');

function runNode(relative, args = []) {
  return spawnSync(process.execPath, [path.join(adapter, relative), ...args], {
    cwd: root,
    encoding: 'utf8'
  });
}

test('Godot adapter source boundary validates from repository root', () => {
  const result = runNode('tools/check-source.mjs');
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  const receipt = JSON.parse(result.stdout);
  assert.equal(receipt.disposition, 'SOURCE_BOUNDARY_VALID');
});

test('Godot adapter build preserves canonical World Package fingerprint', () => {
  const result = runNode('tools/build-adapter.mjs');
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.match(result.stdout, /fe5754cccac19f60ea7aceb4db4b76adffa0771a7adf9c8e0d613820260bf7d2/);
});

test('Godot engine receipt pins an official exact proof version without vendoring', async () => {
  const receipt = JSON.parse(await fs.readFile(path.join(adapter, 'ENGINE-RECEIPT.json'), 'utf8'));
  assert.equal(receipt.releaseTag, '4.7.2-stable');
  assert.equal(receipt.sourceCommit, 'ed1daf0bf001b61586d9930840f2f1394092c079');
  assert.equal(receipt.licenseIdentifier, 'MIT');
  assert.equal(receipt.engineBinaryVendored, false);
  assert.equal(receipt.permanentOrExclusiveAdoption, false);
  assert.equal(receipt.integrityPolicy, 'FETCH_EXACT_RELEASE_ASSET_AND_VERIFY_GITHUB_RELEASE_API_SHA256_DIGEST');
});
