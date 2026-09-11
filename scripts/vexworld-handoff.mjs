#!/usr/bin/env node

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { repositoryRoot } from './vexworld-impact.mjs';
import { runHealth } from './vexworld-health.mjs';

async function readJson(relative) {
  return JSON.parse(await fs.readFile(path.join(repositoryRoot, relative), 'utf8'));
}

function unique(values) {
  return [...new Set(values)].sort();
}

export async function buildHandoff({ root = repositoryRoot } = {}) {
  const [health, projectState, technologyRegistry, assetPolicy] = await Promise.all([
    runHealth({ root, includeInventory: true }),
    fs.readFile(path.join(root, 'config/project-state.json'), 'utf8').then(JSON.parse),
    fs.readFile(path.join(root, 'config/technology-candidates.json'), 'utf8').then(JSON.parse),
    fs.readFile(path.join(root, 'config/asset-intake-policy.json'), 'utf8').then(JSON.parse)
  ]);

  const activeStage = projectState.stages.find((stage) => stage.stageRef === projectState.activeStageRef) ?? null;
  const activeIndex = projectState.stages.findIndex((stage) => stage.stageRef === projectState.activeStageRef);
  const nextStage = activeIndex >= 0 ? projectState.stages[activeIndex + 1] ?? null : null;
  const selectedEngine = technologyRegistry.candidates.find(
    (candidate) => candidate.disposition === 'SELECTED_FOR_BOUNDED_PROOF'
  ) ?? null;
  const assetCandidates = assetPolicy.candidateAssets.map((asset) => ({
    assetCandidateRef: asset.assetCandidateRef,
    disposition: asset.disposition,
    downloadedAtOrNull: asset.downloadedAtOrNull,
    localPathOrNull: asset.localPathOrNull
  }));

  return {
    schemaVersion: 'vexworld.fresh-instance-handoff/v1',
    projectRef: projectState.projectRef,
    repositoryRef: projectState.repositoryRef,
    projectLedgerRef: projectState.projectLedgerRef,
    programEpicRef: projectState.programEpicRef,
    crossRepoFoundationRef: projectState.crossRepoFoundationRef,
    currentVersionRef: projectState.currentVersionRef,
    currentVersionPath: projectState.currentVersionPath,
    stage: activeStage,
    nextStageRefOrNull: nextStage?.stageRef ?? null,
    repositoryObservation: {
      branch: health.git.branch,
      headRef: health.git.head,
      treeRef: health.git.tree,
      workingTreeState: health.git.status ? 'DIRTY_INSPECT_REQUIRED' : 'CLEAN',
      healthDisposition: health.disposition,
      unmappedPathRefs: health.inventory.unmappedFiles
    },
    requiredReadOrder: projectState.requiredReadOrder,
    requiredCommands: [
      'npm run orient',
      'npm run health',
      'npm run check',
      'npm run impact -- --base <accepted-base> --head HEAD',
      'npm run handoff'
    ],
    activeOwnedPathPatterns: activeStage?.ownedPathPatterns ?? [],
    allowedEffects: activeStage?.allowedEffects ?? [],
    forbiddenEffects: activeStage?.forbiddenEffects ?? [],
    knownUnknownRefs: projectState.knownUnknownRefs,
    selectedTechnologyCandidate: selectedEngine
      ? {
          technologyRef: selectedEngine.technologyRef,
          versionOrRevision: selectedEngine.versionOrRevision,
          disposition: selectedEngine.disposition,
          candidateStageRef: selectedEngine.candidateStageRef,
          implementationEvidenceRefs: selectedEngine.implementationEvidenceRefs
        }
      : null,
    assetCandidateSummary: assetCandidates,
    assetIntakeState: {
      downloadedCandidateCount: assetCandidates.filter((asset) => asset.downloadedAtOrNull !== null).length,
      acceptedCandidateCount: assetCandidates.filter((asset) => asset.disposition.startsWith('ACCEPTED_')).length,
      defaultDisposition: assetPolicy.defaultDisposition
    },
    reviewRequirements: {
      builderMaySelfCheck: true,
      independentExactHeadReviewRequired: true,
      sourceChangeInvalidatesPriorExactHeadReview: true,
      reviewOwnerRef: activeStage?.reviewOwnerRef ?? null
    },
    stageCloseReceiptFields: [
      'schemaVersion',
      'stageRef',
      'stageIssueRef',
      'acceptedBaseRef',
      'acceptedHeadRef',
      'acceptedTreeRef',
      'changedPathRefs',
      'scenarioEvidenceRefs',
      'testEvidenceRefs',
      'humanOrBrowserWitnessRefs',
      'reviewReceiptRefs',
      'knownResidualRefs',
      'whatItProves',
      'whatItDoesNotProve',
      'nextUnblockedStageRefs',
      'nextActionOwnerRef',
      'claimReleased',
      'closedAt'
    ],
    strongestCurrentClaim: projectState.currentStrongestClaim,
    whatItDoesNotProve: unique([
      'ACTIVE_STAGE_ACCEPTED',
      'SELECTED_ENGINE_ADOPTED',
      'EXTERNAL_ASSET_LICENSE_ACCEPTED',
      'REAL_LOCAL_MODEL_BEHAVIOR_PROVEN',
      'PRODUCTION_NETWORK_AUTHORIZED',
      'PHYSICAL_ACTUATION_AUTHORIZED',
      'SOFTWARE_LICENSE_SELECTED'
    ]),
    effects: {
      sourceMutation: false,
      merge: false,
      publication: false,
      modelTraining: false,
      network: false,
      physicalActuation: false,
      commerce: false
    },
    disposition:
      health.disposition === 'HEALTHY_FOR_CURRENT_STAGE'
        ? 'READY_FOR_BOUNDED_STAGE_OR_REVIEW_CONTINUATION'
        : 'BLOCKED_REPOSITORY_HEALTH_ATTENTION_REQUIRED'
  };
}

export function renderHandoffMarkdown(handoff) {
  const stage = handoff.stage ?? {};
  const lines = [
    '# VexWorld fresh-instance handoff',
    '',
    '`[VXG RealForever]`',
    '',
    `- Project: \`${handoff.projectRef}\``,
    `- Program: \`${handoff.programEpicRef}\``,
    `- Active stage: \`${stage.stageRef ?? 'UNKNOWN'}\``,
    `- Stage issue: \`${stage.issueRef ?? 'UNKNOWN'}\``,
    `- Stage state: \`${stage.state ?? 'UNKNOWN'}\``,
    `- Repository branch: \`${handoff.repositoryObservation.branch ?? 'UNKNOWN'}\``,
    `- Head: \`${handoff.repositoryObservation.headRef ?? 'UNKNOWN'}\``,
    `- Tree: \`${handoff.repositoryObservation.treeRef ?? 'UNKNOWN'}\``,
    `- Disposition: **${handoff.disposition}**`,
    '',
    '## Read in order',
    ...handoff.requiredReadOrder.map((entry, index) => `${index + 1}. \`${entry}\``),
    '',
    '## Run',
    '```text',
    ...handoff.requiredCommands,
    '```',
    '',
    '## Owned paths',
    ...handoff.activeOwnedPathPatterns.map((entry) => `- \`${entry}\``),
    '',
    '## Allowed effects',
    ...(handoff.allowedEffects.length ? handoff.allowedEffects.map((entry) => `- \`${entry}\``) : ['- None']),
    '',
    '## Forbidden effects',
    ...(handoff.forbiddenEffects.length ? handoff.forbiddenEffects.map((entry) => `- \`${entry}\``) : ['- None']),
    '',
    '## Known unknowns',
    ...(handoff.knownUnknownRefs.length ? handoff.knownUnknownRefs.map((entry) => `- \`${entry}\``) : ['- None']),
    '',
    '## Current selected engine proof candidate',
    handoff.selectedTechnologyCandidate
      ? `\`${handoff.selectedTechnologyCandidate.technologyRef}\` — ${handoff.selectedTechnologyCandidate.versionOrRevision} — ${handoff.selectedTechnologyCandidate.disposition}`
      : 'None',
    '',
    '## What this does not prove',
    ...handoff.whatItDoesNotProve.map((entry) => `- \`${entry}\``),
    '',
    'A fresh recipient must re-ground live repository state and bind all work or review to the exact observed head/tree. This packet is no-effect orientation, not inherited authority.',
    '',
    '<!-- [VXG RealForever] -->'
  ];
  return `${lines.join('\n')}\n`;
}

function parseFormat(args) {
  const index = args.indexOf('--format');
  return index >= 0 ? args[index + 1] : 'markdown';
}

async function main() {
  const format = parseFormat(process.argv.slice(2));
  if (!['markdown', 'json'].includes(format)) throw new TypeError('--format must be markdown or json');
  const handoff = await buildHandoff();
  process.stdout.write(format === 'json' ? `${JSON.stringify(handoff, null, 2)}\n` : renderHandoffMarkdown(handoff));
  if (handoff.disposition.startsWith('BLOCKED_')) process.exitCode = 2;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.stack ?? error.message);
    process.exitCode = 1;
  });
}

// [VXG RealForever]
