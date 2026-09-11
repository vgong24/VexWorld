import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  runHealth,
  validateAssetIntake,
  validateAssetPolicy,
  validateProjectState,
  validateTechnologyRegistry,
  validateVersionBinding
} from '../scripts/vexworld-health.mjs';
import {
  classifyFiles,
  loadImpactMap,
  matchesPattern,
  validateImpactMap
} from '../scripts/vexworld-impact.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

async function readJson(relative) {
  return JSON.parse(await fs.readFile(path.join(root, relative), 'utf8'));
}

function clone(value) {
  return structuredClone(value);
}

test('current repository control sources are internally valid', async () => {
  const [projectState, technologyRegistry, assetPolicy, repositoryManifest, currentVersion, impactMap] =
    await Promise.all([
      readJson('config/project-state.json'),
      readJson('config/technology-candidates.json'),
      readJson('config/asset-intake-policy.json'),
      readJson('vexworld.manifest.json'),
      readJson('config/current-version.json'),
      loadImpactMap(root)
    ]);

  assert.deepEqual(validateProjectState(projectState), []);
  assert.deepEqual(validateTechnologyRegistry(technologyRegistry), []);
  assert.deepEqual(validateAssetPolicy(assetPolicy), []);
  assert.deepEqual(validateImpactMap(impactMap), []);
  assert.deepEqual(validateVersionBinding({ repositoryManifest, currentVersion, projectState }), []);
});

test('repository health inventories every checked-in source through an explicit impact route', async () => {
  const receipt = await runHealth({ root, includeInventory: true });
  assert.equal(receipt.disposition, 'HEALTHY_FOR_CURRENT_STAGE', receipt.errors.join('\n'));
  assert.equal(receipt.errorCount, 0, receipt.errors.join('\n'));
  assert.equal(receipt.inventory.unmappedPathCount, 0, receipt.inventory.unmappedFiles.join('\n'));
  assert.ok(receipt.inventory.fileCount > 0);
});

test('one-lane state rejects multiple active source-changing stages', async () => {
  const projectState = await readJson('config/project-state.json');
  const broken = clone(projectState);
  broken.stages[1].state = 'ACTIVE_SINGLE_FORWARD_LANE';
  broken.stages[1].sourceChanging = true;
  const errors = validateProjectState(broken);
  assert.ok(errors.some((error) => error.includes('exactly one active source-changing stage')));
});

test('ordered stage breadcrumbs reject a broken immediate-predecessor edge', async () => {
  const projectState = await readJson('config/project-state.json');
  const broken = clone(projectState);
  broken.stages[2].predecessorStageRef = broken.stages[0].stageRef;
  const errors = validateProjectState(broken);
  assert.ok(errors.some((error) => error.includes('predecessorStageRef must equal immediate predecessor')));
});

test('technology candidates cannot become adopted from a name or preference alone', async () => {
  const registry = await readJson('config/technology-candidates.json');
  const broken = clone(registry);
  const selected = broken.candidates.find((candidate) => candidate.disposition === 'SELECTED_FOR_BOUNDED_PROOF');
  selected.disposition = 'ADOPTED';
  selected.implementationEvidenceRefs = [];
  const errors = validateTechnologyRegistry(broken);
  assert.ok(errors.some((error) => error.includes('cannot be ADOPTED without implementation evidence')));
});

test('accepted asset intake requires exact downloaded artifact, hash, license and local path', async () => {
  const policy = await readJson('config/asset-intake-policy.json');
  const incomplete = Object.fromEntries(policy.requiredIntakeFields.map((field) => [field, null]));
  Object.assign(incomplete, {
    assetCandidateRef: 'asset-candidate.synthetic.fixture',
    displayName: 'Synthetic fixture',
    assetClass: 'TEST_ONLY',
    officialSourceUrl: 'https://example.invalid/fixture',
    sourcePublisherRef: 'publisher.synthetic',
    artifactVersionOrRelease: '1.0.0',
    licenseSpdxOrExactIdentifier: 'CC0-1.0',
    licenseSourceUrl: 'https://example.invalid/license',
    permittedUseSummary: 'Synthetic test only',
    attributionRequirement: 'NONE',
    modificationRecordRefs: [],
    intendedVexWorldUse: 'Contract test',
    disposition: 'ACCEPTED_REFERENCE_STRUCTURE_ONLY'
  });

  const incompleteErrors = validateAssetIntake(policy, incomplete);
  assert.ok(incompleteErrors.some((error) => error.includes('downloadedAtOrNull')));
  assert.ok(incompleteErrors.some((error) => error.includes('SHA-256')));
  assert.ok(incompleteErrors.some((error) => error.includes('localPathOrNull')));

  const complete = {
    ...incomplete,
    downloadedAtOrNull: '2026-09-10T00:00:00Z',
    sha256OrNull: 'a'.repeat(64),
    localPathOrNull: 'assets/quarantine/synthetic-fixture.glb'
  };
  assert.deepEqual(validateAssetIntake(policy, complete), []);
});

test('known paths reveal impacted capabilities and unmapped paths fail visibly', async () => {
  const map = await loadImpactMap(root);
  const receipt = classifyFiles([
    'README.md',
    'versions/v1/browser/index.html',
    'adapters/godot/README.md',
    'unplaced/new-system.xyz'
  ], map);

  assert.equal(receipt.disposition, 'ATTENTION_UNMAPPED_PATHS');
  assert.deepEqual(receipt.unmappedFiles, ['unplaced/new-system.xyz']);
  assert.ok(receipt.capabilityRefs.includes('capability.vexworld.repository-orientation'));
  assert.ok(receipt.capabilityRefs.includes('capability.vexworld.browser-experience'));
  assert.ok(receipt.capabilityRefs.includes('capability.vexworld.engine-adapter'));
});

test('glob matching keeps explicit world, adapter and root routes distinguishable', () => {
  assert.equal(matchesPattern('versions/v1/browser/index.html', 'versions/*/browser/**'), true);
  assert.equal(matchesPattern('adapters/godot/project.godot', 'adapters/**'), true);
  assert.equal(matchesPattern('README.md', 'README.md'), true);
  assert.equal(matchesPattern('versions/v1/browser/index.html', 'versions/*/world/**'), false);
});

test('current-version drift is rejected instead of selecting a nearby version', async () => {
  const [repositoryManifest, currentVersion, projectState] = await Promise.all([
    readJson('vexworld.manifest.json'),
    readJson('config/current-version.json'),
    readJson('config/project-state.json')
  ]);
  const broken = clone(currentVersion);
  broken.currentVersionRef = 'version.vexworld.v999';
  broken.versionRef = 'version.vexworld.v999';
  const errors = validateVersionBinding({ repositoryManifest, currentVersion: broken, projectState });
  assert.ok(errors.length >= 1);
});

// [VXG RealForever]
