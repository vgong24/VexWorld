import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { canonicalSourceText } from '../versions/v1/src/compiler/world-compiler.mjs';

const root = process.cwd();
const adapter = path.join(root, 'adapters', 'godot');
const generatedSourceMap = path.join(root, 'versions', 'v1', 'generated', 'first-grove.source-map.json');

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

test('World Package source hashing is checkout line-ending invariant', () => {
  const lf = '{\n  "meaning": "same"\n}\n';
  const crlf = lf.replaceAll('\n', '\r\n');
  assert.equal(canonicalSourceText(crlf), lf);
  assert.equal(canonicalSourceText(lf), lf);
});

test('Godot adapter build preserves the current canonical World Package fingerprint', async () => {
  const sourceMap = JSON.parse(await fs.readFile(generatedSourceMap, 'utf8'));
  const result = runNode('tools/build-adapter.mjs');
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.match(result.stdout, new RegExp(sourceMap.integrityFingerprint));
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
