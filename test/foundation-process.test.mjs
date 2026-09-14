import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
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
import { buildHandoff } from '../scripts/vexworld-handoff.mjs';
import {
  classifyFiles,
  loadImpactMap,
  matchesPattern,
  validateImpactMap
} from '../scripts/vexworld-impact.mjs';
import { resolveCurrentVersionSourcePath } from '../scripts/vexworld-selfplay.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

async function readJson(relative) {
  return JSON.parse(await fs.readFile(path.join(root, relative), 'utf8'));
}

function clone(value) {
  return structuredClone(value);
}

function activeRouteFixture(projectState) {
  const active = clone(projectState);
  const terminal = active.stages.at(-1);
  active.forwardRouteDisposition = 'ACTIVE_FORWARD_ROUTE';
  active.activeStageRef = terminal.stageRef;
  active.activeStageIssueRef = terminal.issueRef;
  terminal.state = 'ACTIVE_SINGLE_FORWARD_LANE';
  terminal.sourceChanging = true;
  return active;
}

function acceptedAssetFixture() {
  return {
    assetCandidateRef: 'asset-candidate.synthetic.fixture',
    displayName: 'Synthetic fixture',
    assetClass: 'TEST_ONLY',
    officialSourceUrl: 'https://example.invalid/fixture',
    sourcePublisherRef: 'publisher.synthetic',
    artifactVersionOrRelease: '1.0.0',
    downloadedAtOrNull: '2026-09-10T00:00:00Z',
    sha256OrNull: 'a'.repeat(64),
    licenseSpdxOrExactIdentifier: 'CC0-1.0',
    licenseSourceUrl: 'https://example.invalid/license',
    permittedUseSummary: 'Synthetic test fixture permitted for contract proof.',
    attributionRequirement: 'NONE',
    modificationRecordRefs: ['modification.synthetic.none.v1'],
    intendedVexWorldUse: 'Contract test',
    localPathOrNull: 'assets/quarantine/synthetic-fixture.glb',
    replacementProofRefOrNull: 'proof.synthetic.asset-replacement.v1',
    disposition: 'ACCEPTED_REFERENCE_STRUCTURE_ONLY'
  };
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

test('terminal Atlas route is healthy only with zero active lanes and accepted terminal receipts', async () => {
  const projectState = await readJson('config/project-state.json');
  assert.equal(projectState.forwardRouteDisposition, 'ATLAS_ROUTE_COMPLETE_IDLE');
  assert.equal(projectState.activeStageRef, 'NONE');
  assert.equal(projectState.activeStageIssueRef, 'NONE');
  assert.equal(
    projectState.stages.filter(
      (stage) => stage.state === 'ACTIVE_SINGLE_FORWARD_LANE' && stage.sourceChanging === true
    ).length,
    0
  );
  assert.deepEqual(validateProjectState(projectState), []);

  const staleActiveRef = clone(projectState);
  staleActiveRef.activeStageRef = staleActiveRef.stages.at(-1).stageRef;
  assert.ok(
    validateProjectState(staleActiveRef)
      .some((error) => error.includes('terminal idle activeStageRef must be NONE'))
  );

  const staleActiveIssue = clone(projectState);
  staleActiveIssue.activeStageIssueRef = staleActiveIssue.stages.at(-1).issueRef;
  assert.ok(
    validateProjectState(staleActiveIssue)
      .some((error) => error.includes('terminal idle activeStageIssueRef must be NONE'))
  );

  const activeTerminal = clone(projectState);
  activeTerminal.stages.at(-1).state = 'ACTIVE_SINGLE_FORWARD_LANE';
  activeTerminal.stages.at(-1).sourceChanging = true;
  const activeTerminalErrors = validateProjectState(activeTerminal);
  assert.ok(activeTerminalErrors.some((error) => error.includes('zero active source-changing stages')));
  assert.ok(activeTerminalErrors.some((error) => error.includes('accepted terminal stage')));
  assert.ok(activeTerminalErrors.some((error) => error.includes('terminal sourceChanging=false')));

  const missingCloseReceipt = clone(projectState);
  delete missingCloseReceipt.stages.at(-1).acceptedCloseReceiptRef;
  assert.ok(
    validateProjectState(missingCloseReceipt)
      .some((error) => error.includes('terminal acceptedCloseReceiptRef'))
  );

  const missingAcceptedMain = clone(projectState);
  delete missingAcceptedMain.stages.at(-1).acceptedMainRef;
  assert.ok(
    validateProjectState(missingAcceptedMain)
      .some((error) => error.includes('terminal acceptedMainRef'))
  );

  const mismatchedAcceptedMain = clone(projectState);
  mismatchedAcceptedMain.lastAcceptedMainRef = 'github.commit.vexworld.stale';
  assert.ok(
    validateProjectState(mismatchedAcceptedMain)
      .some((error) => error.includes('lastAcceptedMainRef must equal terminal acceptedMainRef'))
  );
});

test('ordinary active route still requires exactly one active source-changing stage', async () => {
  const projectState = await readJson('config/project-state.json');
  const zeroActive = clone(projectState);
  zeroActive.forwardRouteDisposition = 'ACTIVE_FORWARD_ROUTE';
  const zeroErrors = validateProjectState(zeroActive);
  assert.ok(zeroErrors.some((error) => error.includes('exactly one active source-changing stage')));

  const active = activeRouteFixture(projectState);
  assert.deepEqual(validateProjectState(active), []);

  const secondIndex = active.stages.findIndex((_, index) => index !== active.stages.length - 1);
  assert.ok(secondIndex >= 0, 'fixture requires at least two stages');
  active.stages[secondIndex].state = 'ACTIVE_SINGLE_FORWARD_LANE';
  active.stages[secondIndex].sourceChanging = true;
  const multipleErrors = validateProjectState(active);
  assert.ok(multipleErrors.some((error) => error.includes('exactly one active source-changing stage')));
});

test('terminal handoff describes idle route without inventing successor authority', async () => {
  const handoff = await buildHandoff({ root });
  assert.equal(handoff.forwardRouteDisposition, 'ATLAS_ROUTE_COMPLETE_IDLE');
  assert.equal(handoff.stage, null);
  assert.equal(handoff.nextStageRefOrNull, null);
  assert.deepEqual(handoff.activeOwnedPathPatterns, []);
  assert.deepEqual(handoff.allowedEffects, []);
  assert.equal(handoff.reviewRequirements.independentExactHeadReviewRequired, false);
  assert.equal(handoff.reviewRequirements.reviewOwnerRef, null);
  assert.equal(handoff.disposition, 'ATLAS_ROUTE_COMPLETE_IDLE__NO_SUCCESSOR_ADMITTED');
  assert.ok(handoff.whatItDoesNotProve.includes('SUCCESSOR_STAGE_ADMITTED'));
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

test('root self-play resolves the canonical current-version sourcePath', async () => {
  const currentVersion = await readJson('config/current-version.json');
  assert.equal(currentVersion.sourcePath, 'versions/v1');
  assert.equal(resolveCurrentVersionSourcePath(currentVersion), 'versions/v1');
});

test('accepted asset intake requires exact provenance, transformation history and replacement proof', async () => {
  const policy = await readJson('config/asset-intake-policy.json');
  const complete = acceptedAssetFixture();
  assert.deepEqual(validateAssetIntake(policy, complete), []);

  const missingIdentity = clone(complete);
  missingIdentity.officialSourceUrl = null;
  missingIdentity.sourcePublisherRef = null;
  missingIdentity.artifactVersionOrRelease = null;
  const identityErrors = validateAssetIntake(policy, missingIdentity);
  assert.ok(identityErrors.some((error) => error.includes('officialSourceUrl')));
  assert.ok(identityErrors.some((error) => error.includes('sourcePublisherRef')));
  assert.ok(identityErrors.some((error) => error.includes('artifactVersionOrRelease')));

  const placeholderVersion = clone(complete);
  placeholderVersion.artifactVersionOrRelease = 'UNPINNED';
  assert.ok(
    validateAssetIntake(policy, placeholderVersion)
      .some((error) => error.includes('non-placeholder artifactVersionOrRelease'))
  );

  const candidateLicense = clone(complete);
  candidateLicense.licenseSpdxOrExactIdentifier = 'CC0-1.0_CANDIDATE_VERIFY_AT_DOWNLOAD';
  assert.ok(
    validateAssetIntake(policy, candidateLicense)
      .some((error) => error.includes('non-placeholder license identifier'))
  );

  const mixedLicense = clone(complete);
  mixedLicense.licenseSpdxOrExactIdentifier = 'MIXED_REQUIRES_EXACT_ASSET_RECORD';
  assert.ok(
    validateAssetIntake(policy, mixedLicense)
      .some((error) =>
        error.includes('non-placeholder license identifier') ||
        error.includes('blocked or unresolved license class') ||
        error.includes('not in an accepted/reviewed license class')
      )
  );

  const missingTransformation = clone(complete);
  missingTransformation.modificationRecordRefs = [];
  assert.ok(
    validateAssetIntake(policy, missingTransformation)
      .some((error) => error.includes('modification/transformation'))
  );

  const missingReplacement = clone(complete);
  missingReplacement.replacementProofRefOrNull = null;
  assert.ok(
    validateAssetIntake(policy, missingReplacement)
      .some((error) => error.includes('replacementProofRefOrNull'))
  );
});

test('repository health rejects a checked-in asset promoted to accepted without evidence', async (t) => {
  const tempRoot = await fs.mkdtemp(path.join(tmpdir(), 'vexworld-asset-health-'));
  t.after(async () => {
    await fs.rm(tempRoot, { recursive: true, force: true });
  });

  await fs.cp(root, tempRoot, {
    recursive: true,
    filter(source) {
      const relative = path.relative(root, source).replaceAll('\\', '/');
      return relative === '' ||
        (!relative.startsWith('.git') && !relative.startsWith('node_modules') && !relative.startsWith('.vexworld'));
    }
  });

  const policyPath = path.join(tempRoot, 'config', 'asset-intake-policy.json');
  const policy = JSON.parse(await fs.readFile(policyPath, 'utf8'));
  const promoted = policy.candidateAssets[0];
  promoted.disposition = 'ACCEPTED_REFERENCE_STRUCTURE_ONLY';
  await fs.writeFile(policyPath, `${JSON.stringify(policy, null, 2)}\n`, 'utf8');

  const receipt = await runHealth({ root: tempRoot, includeInventory: false });
  assert.equal(receipt.disposition, 'ATTENTION_REQUIRED');
  assert.ok(
    receipt.errors.some((error) =>
      error.includes(promoted.assetCandidateRef) &&
      error.includes('artifactVersionOrRelease')
    ),
    receipt.errors.join('\n')
  );
  assert.ok(
    receipt.errors.some((error) => error.includes('replacementProofRefOrNull')),
    receipt.errors.join('\n')
  );
});

test('known paths reveal impacted capabilities and genuinely new implementation paths fail visibly', async () => {
  const map = await loadImpactMap(root);
  const receipt = classifyFiles([
    'README.md',
    'versions/v1/src/web/index.html',
    'adapters/godot/README.md',
    'versions/v1/src/new-capability/foo.mjs',
    'versions/v1/scripts/new-capability.mjs'
  ], map);

  assert.equal(receipt.disposition, 'ATTENTION_UNMAPPED_PATHS');
  assert.deepEqual(receipt.unmappedFiles, [
    'versions/v1/scripts/new-capability.mjs',
    'versions/v1/src/new-capability/foo.mjs'
  ]);
  assert.ok(receipt.capabilityRefs.includes('capability.vexworld.repository-orientation'));
  assert.ok(receipt.capabilityRefs.includes('capability.vexworld.browser-experience'));
  assert.ok(receipt.capabilityRefs.includes('capability.vexworld.engine-adapter'));
  assert.equal(map.rules.some((rule) => rule.pathPatterns.includes('versions/*/src/**')), false);
  assert.equal(map.rules.some((rule) => rule.pathPatterns.includes('versions/*/scripts/**')), false);
});

test('existing Version 1 scripts have explicit semantic impact routes', async () => {
  const map = await loadImpactMap(root);
  const receipt = classifyFiles([
    'versions/v1/scripts/start-mac.command',
    'versions/v1/scripts/start-windows.bat',
    'versions/v1/scripts/start-lan-mac.command',
    'versions/v1/scripts/start-lan-windows.bat',
    'versions/v1/scripts/vex-relay-self-play.mjs'
  ], map);

  assert.equal(receipt.disposition, 'IMPACT_CLASSIFIED');
  assert.deepEqual(receipt.unmappedFiles, []);
  assert.ok(receipt.matchedRuleRefs.includes('impact.vexworld.version-local-start-scripts'));
  assert.ok(receipt.matchedRuleRefs.includes('impact.vexworld.version-lan-start-scripts'));
  assert.ok(receipt.matchedRuleRefs.includes('impact.vexworld.version-selfplay-script'));
});

test('existing Version 1 process definitions have a narrow semantic impact route', async () => {
  const map = await loadImpactMap(root);
  const receipt = classifyFiles([
    'versions/v1/process/close-stage.json',
    'versions/v1/process/develop-feature.json',
    'versions/v1/process/incubate-technique.json'
  ], map);

  assert.equal(receipt.disposition, 'IMPACT_CLASSIFIED');
  assert.deepEqual(receipt.unmappedFiles, []);
  assert.ok(receipt.matchedRuleRefs.includes('impact.vexworld.process-definitions'));
  assert.ok(receipt.capabilityRefs.includes('capability.vexworld.process-definition'));
});

test('glob matching keeps explicit world, adapter and root routes distinguishable', () => {
  assert.equal(matchesPattern('versions/v1/src/web/index.html', 'versions/*/src/web/**'), true);
  assert.equal(matchesPattern('adapters/godot/project.godot', 'adapters/**'), true);
  assert.equal(matchesPattern('README.md', 'README.md'), true);
  assert.equal(matchesPattern('versions/v1/src/web/index.html', 'versions/*/world/**'), false);
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
