import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildAdapter } from '../tools/build-adapter.mjs';
import { checkSource } from '../tools/check-source.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('Godot adapter source preserves the engine boundary and contains no imported art/audio', async () => {
  const receipt = await checkSource();
  assert.equal(receipt.disposition, 'SOURCE_BOUNDARY_VALID', receipt.errors.join('\n'));
  assert.deepEqual(receipt.errors, []);
});

test('adapter build consumes the canonical First Grove package deterministically', async () => {
  const first = await buildAdapter();
  const second = await buildAdapter();
  assert.equal(first.worldPackage.integrityFingerprint, 'fe5754cccac19f60ea7aceb4db4b76adffa0771a7adf9c8e0d613820260bf7d2');
  assert.equal(second.worldPackage.integrityFingerprint, first.worldPackage.integrityFingerprint);
  assert.equal(first.adapterManifest.sourcePackageFingerprint, first.worldPackage.integrityFingerprint);
  assert.deepEqual(first.adapterManifest.externalAssetRefs, []);
});

test('reference parity fixture captures weather-driven return-margin semantics', async () => {
  const { parity } = await buildAdapter();
  assert.deepEqual(parity.expected.CLEAR, {
    predictedReturnCost: 3.97,
    returnMargin: 19.03,
    band: 'RESTORATION_RECOMMENDED'
  });
  assert.deepEqual(parity.expected.RAIN, {
    predictedReturnCost: 6.16,
    returnMargin: 16.84,
    band: 'RESTORATION_RECOMMENDED'
  });
  assert.ok(parity.expected.RAIN.returnMargin < parity.expected.CLEAR.returnMargin);
});

test('generated adapter package stays generated and ignored from source ownership', async () => {
  await buildAdapter();
  const manifest = JSON.parse(await fs.readFile(path.join(root, 'generated/adapter-manifest.json'), 'utf8'));
  assert.equal(manifest.canonicalMeaningOwner, 'VEXWORLD_WORLD_PACKAGE');
  assert.equal(manifest.engineRole, 'REPLACEABLE_REALIZATION_ADAPTER');
  assert.deepEqual(manifest.effects, {
    modelTraining: false,
    productionNetworking: false,
    physicalActuation: false,
    commerce: false
  });
});
