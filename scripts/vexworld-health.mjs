#!/usr/bin/env node

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import {
  classifyFiles,
  loadImpactMap,
  repositoryRoot,
  validateImpactMap
} from './vexworld-impact.mjs';

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function nonempty(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function stringArray(value) {
  return Array.isArray(value) && value.every(nonempty);
}

function unique(values) {
  return new Set(values).size === values.length;
}

async function readJson(root, relative) {
  return JSON.parse(await fs.readFile(path.join(root, relative), 'utf8'));
}

function firstDefined(object, keys) {
  for (const key of keys) {
    if (nonempty(object?.[key])) return object[key];
  }
  return null;
}

export function validateProjectState(state) {
  const errors = [];
  if (!isObject(state)) return ['project state must be an object'];
  if (state.schemaVersion !== 'vexworld.project-state/v1') {
    errors.push('project state schemaVersion must be vexworld.project-state/v1');
  }
  for (const key of [
    'projectRef',
    'repositoryRef',
    'projectLedgerRef',
    'programEpicRef',
    'currentVersionRef',
    'currentVersionPath',
    'activeStageRef',
    'activeStageIssueRef'
  ]) {
    if (!nonempty(state[key])) errors.push(`project state requires ${key}`);
  }
  if (!Array.isArray(state.stages) || state.stages.length === 0) {
    errors.push('project state requires stages');
    return errors;
  }
  if (!stringArray(state.stageOrder) || state.stageOrder.length !== state.stages.length) {
    errors.push('stageOrder must contain every stage exactly once');
  }

  const refs = state.stages.map((stage) => stage?.stageRef).filter(nonempty);
  if (!unique(refs)) errors.push('stageRef values must be unique');
  if (state.stageOrder && JSON.stringify(refs) !== JSON.stringify(state.stageOrder)) {
    errors.push('stages must be stored in exact stageOrder');
  }

  const active = state.stages.filter(
    (stage) => stage?.state === 'ACTIVE_SINGLE_FORWARD_LANE' && stage?.sourceChanging === true
  );
  if (active.length !== 1) {
    errors.push('project state must have exactly one active source-changing stage');
  } else {
    if (active[0].stageRef !== state.activeStageRef) {
      errors.push('activeStageRef must identify the active source-changing stage');
    }
    if (active[0].issueRef !== state.activeStageIssueRef) {
      errors.push('activeStageIssueRef must identify the active stage issue');
    }
  }

  for (const [index, stage] of state.stages.entries()) {
    if (!isObject(stage)) {
      errors.push(`stage[${index}] must be an object`);
      continue;
    }
    for (const key of ['stageRef', 'issueRef', 'title', 'state', 'meaningOwnerRef', 'implementationOwnerRef', 'reviewOwnerRef']) {
      if (!nonempty(stage[key])) errors.push(`${stage.stageRef ?? `stage[${index}]`} requires ${key}`);
    }
    const expectedPredecessor = index === 0 ? null : state.stages[index - 1]?.stageRef;
    if ((stage.predecessorStageRef ?? null) !== expectedPredecessor) {
      errors.push(`${stage.stageRef ?? `stage[${index}]`} predecessorStageRef must equal immediate predecessor ${expectedPredecessor}`);
    }
    if (!Array.isArray(stage.parentStageRefs)) {
      errors.push(`${stage.stageRef ?? `stage[${index}]`} parentStageRefs must be an array`);
    }
    if (!Array.isArray(stage.ownedPathPatterns) || stage.ownedPathPatterns.length === 0) {
      errors.push(`${stage.stageRef ?? `stage[${index}]`} requires ownedPathPatterns`);
    }
    if (stage.state === 'BLOCKED_BY_PREDECESSOR' && index > 0) {
      if (stage.sourceChanging !== false) {
        errors.push(`${stage.stageRef} blocked stage must not claim sourceChanging=true`);
      }
      if (!stringArray(stage.wakeTriggerRefs)) {
        errors.push(`${stage.stageRef} blocked stage requires wakeTriggerRefs`);
      }
    }
  }

  if (!stringArray(state.requiredReadOrder)) errors.push('requiredReadOrder must be a string array');
  if (!stringArray(state.knownUnknownRefs)) errors.push('knownUnknownRefs must be a string array');
  if (!isObject(state.effects) || Object.values(state.effects).some((value) => value !== false)) {
    errors.push('project-state protected effects must all remain false');
  }
  return errors;
}

export function validateTechnologyRegistry(registry) {
  const errors = [];
  if (!isObject(registry)) return ['technology registry must be an object'];
  if (registry.schemaVersion !== 'vexworld.technology-candidate-registry/v1') {
    errors.push('technology registry schemaVersion must be vexworld.technology-candidate-registry/v1');
  }
  if (!nonempty(registry.registryRef)) errors.push('technology registry requires registryRef');
  if (!Array.isArray(registry.candidates) || registry.candidates.length === 0) {
    errors.push('technology registry requires candidates');
    return errors;
  }

  const refs = [];
  for (const [index, candidate] of registry.candidates.entries()) {
    if (!isObject(candidate)) {
      errors.push(`technology candidate[${index}] must be an object`);
      continue;
    }
    for (const key of [
      'technologyRef',
      'name',
      'technologyClass',
      'versionOrRevision',
      'officialSourceUrl',
      'licenseIdentifier',
      'licenseSourceUrl',
      'disposition',
      'adapterBoundary'
    ]) {
      if (!nonempty(candidate[key])) errors.push(`${candidate.technologyRef ?? `candidate[${index}]`} requires ${key}`);
    }
    refs.push(candidate.technologyRef);
    if (!stringArray(candidate.capabilityRefs)) errors.push(`${candidate.technologyRef} capabilityRefs must be a string array`);
    if (!Array.isArray(candidate.knownRisks) || !candidate.knownRisks.every(nonempty)) {
      errors.push(`${candidate.technologyRef} knownRisks must be a string array`);
    }
    if (!Array.isArray(candidate.implementationEvidenceRefs) || !candidate.implementationEvidenceRefs.every(nonempty)) {
      errors.push(`${candidate.technologyRef} implementationEvidenceRefs must be a string array`);
    }
    if (candidate.disposition === 'ADOPTED' && candidate.implementationEvidenceRefs.length === 0) {
      errors.push(`${candidate.technologyRef} cannot be ADOPTED without implementation evidence`);
    }
    if (candidate.disposition === 'SELECTED_FOR_BOUNDED_PROOF' && candidate.versionOrRevision.includes('UNPINNED')) {
      errors.push(`${candidate.technologyRef} selected proof requires an exact version/revision`);
    }
  }
  if (!unique(refs)) errors.push('technologyRef values must be unique');

  const selectedFullEngines = registry.candidates.filter(
    (candidate) =>
      candidate.technologyClass === 'FULL_GAME_ENGINE' &&
      candidate.disposition === 'SELECTED_FOR_BOUNDED_PROOF'
  );
  if (selectedFullEngines.length !== 1) {
    errors.push('technology registry must have exactly one full game engine selected for bounded proof');
  }
  return errors;
}

export function validateAssetPolicy(policy) {
  const errors = [];
  if (!isObject(policy)) return ['asset policy must be an object'];
  if (policy.schemaVersion !== 'vexworld.asset-intake-policy/v1') {
    errors.push('asset policy schemaVersion must be vexworld.asset-intake-policy/v1');
  }
  if (!nonempty(policy.policyRef)) errors.push('asset policy requires policyRef');
  if (!stringArray(policy.requiredIntakeFields) || !unique(policy.requiredIntakeFields)) {
    errors.push('requiredIntakeFields must be a unique string array');
  }
  if (!isObject(policy.licenseClasses)) errors.push('asset policy requires licenseClasses');
  if (!Array.isArray(policy.intakeLifecycle) || !policy.intakeLifecycle.every(nonempty)) {
    errors.push('intakeLifecycle must be a string array');
  }
  if (!Array.isArray(policy.candidateAssets)) {
    errors.push('candidateAssets must be an array');
    return errors;
  }

  const refs = [];
  for (const candidate of policy.candidateAssets) {
    if (!isObject(candidate)) {
      errors.push('asset candidate must be an object');
      continue;
    }
    refs.push(candidate.assetCandidateRef);
    for (const field of policy.requiredIntakeFields ?? []) {
      if (!Object.hasOwn(candidate, field)) errors.push(`${candidate.assetCandidateRef ?? 'asset candidate'} missing ${field}`);
    }
    if (!nonempty(candidate.assetCandidateRef)) errors.push('asset candidate requires assetCandidateRef');
    if (!policy.intakeLifecycle.includes(candidate.disposition)) {
      errors.push(`${candidate.assetCandidateRef} has unsupported disposition ${candidate.disposition}`);
    }
  }
  if (!unique(refs)) errors.push('assetCandidateRef values must be unique');
  return errors;
}

export function validateAssetIntake(policy, intake) {
  const errors = [];
  if (!isObject(intake)) return ['asset intake must be an object'];
  for (const field of policy.requiredIntakeFields ?? []) {
    if (!Object.hasOwn(intake, field)) errors.push(`asset intake missing ${field}`);
  }

  const accepted = ['ACCEPTED_REFERENCE_STRUCTURE_ONLY', 'ACCEPTED_EXPRESSION_INPUT'].includes(intake.disposition);
  if (accepted) {
    if (!nonempty(intake.downloadedAtOrNull)) errors.push('accepted asset requires downloadedAtOrNull');
    if (!nonempty(intake.sha256OrNull) || !/^[a-f0-9]{64}$/i.test(intake.sha256OrNull)) {
      errors.push('accepted asset requires exact SHA-256');
    }
    if (!nonempty(intake.localPathOrNull)) errors.push('accepted asset requires localPathOrNull');
    if (!nonempty(intake.licenseSpdxOrExactIdentifier)) errors.push('accepted asset requires exact license identifier');
    if (!nonempty(intake.licenseSourceUrl)) errors.push('accepted asset requires license source');
    const blocked = policy.licenseClasses?.BLOCKED_UNTIL_SEPARATE_DECISION ?? [];
    if (blocked.some((license) => intake.licenseSpdxOrExactIdentifier?.includes(license))) {
      errors.push('accepted asset uses a blocked or unresolved license class');
    }
  }
  return errors;
}

export function validateVersionBinding({ repositoryManifest, currentVersion, projectState }) {
  const errors = [];
  const manifestRef = firstDefined(repositoryManifest, ['currentVersionRef', 'activeVersionRef', 'versionRef']);
  const manifestPath = firstDefined(repositoryManifest, ['currentVersionPath', 'activeVersionPath', 'sourcePath', 'versionPath']);
  const pointerRef = firstDefined(currentVersion, ['currentVersionRef', 'activeVersionRef', 'versionRef']);
  const pointerPath = firstDefined(currentVersion, ['currentVersionPath', 'activeVersionPath', 'sourcePath', 'versionPath']);
  const stateRef = projectState?.currentVersionRef ?? null;
  const statePath = projectState?.currentVersionPath ?? null;

  if (!pointerRef) errors.push('current-version pointer must declare a version ref');
  if (!pointerPath) errors.push('current-version pointer must declare a source path');
  if (manifestRef && pointerRef && manifestRef !== pointerRef) errors.push('repository manifest and current-version ref disagree');
  if (manifestPath && pointerPath && manifestPath !== pointerPath) errors.push('repository manifest and current-version path disagree');
  if (stateRef && pointerRef && stateRef !== pointerRef) errors.push('project state and current-version ref disagree');
  if (statePath && pointerPath && statePath !== pointerPath) errors.push('project state and current-version path disagree');
  return errors;
}

async function walkFiles(root) {
  const results = [];
  const excludedDirectories = new Set(['.git', 'node_modules', '.vexworld', 'coverage', 'tmp']);

  async function walk(directory, relative = '') {
    const entries = await fs.readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory() && excludedDirectories.has(entry.name)) continue;
      const nextRelative = relative ? `${relative}/${entry.name}` : entry.name;
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) await walk(absolute, nextRelative);
      else if (entry.isFile() || entry.isSymbolicLink()) results.push(nextRelative.replaceAll('\\', '/'));
    }
  }

  await walk(root);
  return results.sort();
}

function gitValue(root, args) {
  const result = spawnSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  return result.status === 0 ? result.stdout.trim() || null : null;
}

export async function runHealth({ root = repositoryRoot, includeInventory = true } = {}) {
  const errors = [];
  const warnings = [];
  const [projectState, technologyRegistry, assetPolicy, repositoryManifest, currentVersion, impactMap] =
    await Promise.all([
      readJson(root, 'config/project-state.json'),
      readJson(root, 'config/technology-candidates.json'),
      readJson(root, 'config/asset-intake-policy.json'),
      readJson(root, 'vexworld.manifest.json'),
      readJson(root, 'config/current-version.json'),
      loadImpactMap(root)
    ]);

  errors.push(...validateProjectState(projectState));
  errors.push(...validateTechnologyRegistry(technologyRegistry));
  errors.push(...validateAssetPolicy(assetPolicy));
  errors.push(...validateVersionBinding({ repositoryManifest, currentVersion, projectState }));
  errors.push(...validateImpactMap(impactMap));

  const requiredPaths = [
    'README.md',
    'CLAUDE.md',
    'config/project-state.json',
    'config/change-impact-map.json',
    'config/technology-candidates.json',
    'config/asset-intake-policy.json',
    'docs/process/ONE-LANE-FORWARD-PROTOCOL.md',
    'docs/process/FRESH-INSTANCE-HANDOFF-TEMPLATE.md',
    'docs/process/CHANGE-IMPACT-AND-ANOMALY-PROTOCOL.md',
    'docs/architecture/ENGINE-AND-ASSET-ADAPTER-STRATEGY.md',
    'docs/architecture/CHARACTER-VESSEL-ADAPTER.md'
  ];
  for (const relative of requiredPaths) {
    try {
      await fs.access(path.join(root, relative));
    } catch {
      errors.push(`required foundation path missing: ${relative}`);
    }
  }

  let inventory = {
    fileCount: 0,
    mappedPathCount: 0,
    ignoredPathCount: 0,
    unmappedPathCount: 0,
    unmappedFiles: []
  };

  if (includeInventory && validateImpactMap(impactMap).length === 0) {
    const files = await walkFiles(root);
    const impact = classifyFiles(files, impactMap, { allowUnmapped: true });
    inventory = {
      fileCount: files.length,
      mappedPathCount: impact.matchedFiles.length,
      ignoredPathCount: impact.ignoredFiles.length,
      unmappedPathCount: impact.unmappedFiles.length,
      unmappedFiles: impact.unmappedFiles
    };
    if (impact.unmappedFiles.length > 0) {
      errors.push(`unmapped repository paths: ${impact.unmappedFiles.join(', ')}`);
    }
  }

  const git = {
    branch: gitValue(root, ['branch', '--show-current']),
    head: gitValue(root, ['rev-parse', 'HEAD']),
    tree: gitValue(root, ['rev-parse', 'HEAD^{tree}']),
    status: gitValue(root, ['status', '--short'])
  };
  if (git.status) warnings.push('working tree contains attributed or unattributed changes; inspect before claiming exact-head review');

  const activeStage = projectState.stages.find((stage) => stage.stageRef === projectState.activeStageRef) ?? null;
  const receipt = {
    schemaVersion: 'vexworld.repository-health-receipt/v1',
    projectRef: projectState.projectRef,
    repositoryRef: projectState.repositoryRef,
    currentVersionRef: projectState.currentVersionRef,
    currentVersionPath: projectState.currentVersionPath,
    activeStageRef: projectState.activeStageRef,
    activeStageIssueRef: projectState.activeStageIssueRef,
    activeStageState: activeStage?.state ?? 'UNKNOWN',
    programEpicRef: projectState.programEpicRef,
    git,
    inventory,
    errorCount: errors.length,
    warningCount: warnings.length,
    errors,
    warnings,
    effects: {
      sourceMutation: false,
      network: false,
      model: false,
      physical: false,
      commerce: false,
      publication: false
    },
    disposition: errors.length === 0 ? 'HEALTHY_FOR_CURRENT_STAGE' : 'ATTENTION_REQUIRED'
  };
  return receipt;
}

function renderMarkdown(receipt) {
  const lines = [
    '# VexWorld repository health',
    '',
    `- Disposition: **${receipt.disposition}**`,
    `- Active stage: \`${receipt.activeStageRef}\``,
    `- Stage issue: \`${receipt.activeStageIssueRef}\``,
    `- Current version: \`${receipt.currentVersionRef}\` at \`${receipt.currentVersionPath}\``,
    `- Repository files: ${receipt.inventory.fileCount}`,
    `- Unmapped paths: ${receipt.inventory.unmappedPathCount}`,
    `- Errors: ${receipt.errorCount}`,
    `- Warnings: ${receipt.warningCount}`
  ];
  if (receipt.errors.length) lines.push('', '## Errors', ...receipt.errors.map((error) => `- ${error}`));
  if (receipt.warnings.length) lines.push('', '## Warnings', ...receipt.warnings.map((warning) => `- ${warning}`));
  lines.push('', '<!-- [VXG RealForever] -->');
  return `${lines.join('\n')}\n`;
}

async function main() {
  const args = process.argv.slice(2);
  const formatIndex = args.indexOf('--format');
  const format = formatIndex >= 0 ? args[formatIndex + 1] : 'markdown';
  const receipt = await runHealth({ includeInventory: !args.includes('--no-inventory') });
  process.stdout.write(format === 'json' ? `${JSON.stringify(receipt, null, 2)}\n` : renderMarkdown(receipt));
  if (receipt.disposition !== 'HEALTHY_FOR_CURRENT_STAGE') process.exitCode = 2;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.stack ?? error.message);
    process.exitCode = 1;
  });
}

// [VXG RealForever]
