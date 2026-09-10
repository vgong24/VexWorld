import { promises as fs } from 'node:fs';

const manifest = JSON.parse(await fs.readFile('vexworld.manifest.json', 'utf8'));
const build = JSON.parse(await fs.readFile('config/build-graph.json', 'utf8'));
const unknowns = JSON.parse(await fs.readFile('config/unknowns.json', 'utf8'));
const active = build.stages.filter((stage) => stage.state === 'candidate').map((stage) => stage.stageRef);
console.log(JSON.stringify({
  schemaVersion: 'vexworld.orientation-receipt/v1',
  projectRef: manifest.projectRef,
  repositoryRef: manifest.repositoryRef,
  currentCandidateStages: active,
  entry: ['README.md', 'vexworld.manifest.json', 'CLAUDE.md', 'config/source-map.json'],
  projectLedgerRef: manifest.projectLedgerRef,
  architectureAtlasRef: manifest.architectureAtlasRef,
  openUnknownCount: unknowns.unknowns.length,
  strongestClaim: 'LOCAL_BOOTSTRAP_CANDIDATE_REQUIRES_FRESH_REVIEW_AND_VICTOR_PLAYTEST',
  effects: manifest.effects
}, null, 2));
