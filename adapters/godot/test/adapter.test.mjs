import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildAdapter } from '../tools/build-adapter.mjs';
import { checkSource } from '../tools/check-source.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = path.resolve(root, '../..');
const generatedSourceMap = path.join(repoRoot, 'versions', 'v1', 'generated', 'first-grove.source-map.json');

test('Godot adapter source preserves the engine boundary and contains no imported art/audio', async () => {
  const receipt = await checkSource();
  assert.equal(receipt.disposition, 'SOURCE_BOUNDARY_VALID', receipt.errors.join('\n'));
  assert.deepEqual(receipt.errors, []);
});

test('adapter build consumes the current canonical First Grove package deterministically', async () => {
  const sourceMap = JSON.parse(await fs.readFile(generatedSourceMap, 'utf8'));
  const first = await buildAdapter();
  const second = await buildAdapter();
  assert.equal(first.worldPackage.integrityFingerprint, sourceMap.integrityFingerprint);
  assert.equal(second.worldPackage.integrityFingerprint, first.worldPackage.integrityFingerprint);
  assert.equal(first.adapterManifest.sourcePackageFingerprint, first.worldPackage.integrityFingerprint);
  assert.deepEqual(first.adapterManifest.externalAssetRefs, []);
});

test('Godot projection consumes VexWorld-owned character expression refs without owning identity', async () => {
  const { characterExpressions, adapterManifest } = await buildAdapter();
  assert.equal(characterExpressions.semanticOwner, 'VEXWORLD_CHARACTER_VESSEL_ADAPTER');
  assert.equal(characterExpressions.engineRole, 'REPLACEABLE_REALIZATION_ADAPTER');
  assert.equal(characterExpressions.bindings.human.vesselRef, 'vessel.first-grove.human.reference');
  assert.equal(characterExpressions.bindings.companion.vesselRef, 'vessel.first-grove.companion.reference');
  assert.equal(characterExpressions.bindings.human.expressionBindingRef, 'expression.vexworld.original-human-reference.v1');
  assert.equal(characterExpressions.bindings.companion.expressionBindingRef, 'expression.vexworld.original-companion-reference.v1');
  assert.deepEqual(adapterManifest.characterExpressionRefs, [
    'expression.vexworld.original-human-reference.v1',
    'expression.vexworld.original-companion-reference.v1'
  ]);
  assert.deepEqual(adapterManifest.externalAssetRefs, []);
});

test('current World Package carries Stage D resident discovery and Witness semantics into the Godot build', async () => {
  const { worldPackage } = await buildAdapter();
  assert.ok(worldPackage.map.residents.some((entry) => entry.residentRef === 'resident.first-grove.ilex'));
  assert.ok(worldPackage.map.discoveries.some((entry) => entry.discoveryRef === 'discovery.first-grove.sunshower-bell'));
  assert.ok(worldPackage.map.discoveries.some((entry) => entry.discoveryRef === 'discovery.first-grove.echo-petals'));
  assert.ok(worldPackage.map.worldWitnessSites.some((entry) => entry.siteRef === 'site.first-grove.echo-overlook'));
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
  assert.equal(manifest.characterExpressionOwner, 'VEXWORLD_CHARACTER_VESSEL_ADAPTER');
  assert.equal(manifest.engineRole, 'REPLACEABLE_REALIZATION_ADAPTER');
  assert.deepEqual(manifest.effects, {
    modelTraining: false,
    productionNetworking: false,
    physicalActuation: false,
    commerce: false
  });
});
