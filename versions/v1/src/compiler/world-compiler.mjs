import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { canonicalJson, sortDeep } from '../core/utils.mjs';

const SOURCE_FILES = Object.freeze([
  'worlds/first-grove/manifest.json',
  'worlds/first-grove/map.json',
  'worlds/first-grove/laws.json',
  'worlds/first-grove/expressions.json',
  'world/archetypes.json',
  'world/behaviors.json',
  'world/actions.json',
  'world/practices.json',
  'world/abilities.json',
  'world/team-techniques.json'
]);

export function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

export function canonicalSourceText(value) {
  return String(value).replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

async function readJson(root, relativePath) {
  const text = await fs.readFile(path.join(root, relativePath), 'utf8');
  return { text, value: JSON.parse(text) };
}

function requireString(value, field, location) {
  if (typeof value?.[field] !== 'string' || !value[field]) {
    throw new TypeError(`${location}.${field} must be a non-empty string`);
  }
}

function validateSource({ manifest, map, laws, expressions, catalogs, scenarios }) {
  if (manifest.schemaVersion !== 'vexworld.world-manifest/v1') throw new TypeError('invalid world manifest schemaVersion');
  for (const field of ['worldRef', 'title', 'realityClass', 'mapRef', 'lawRef', 'expressionRef']) requireString(manifest, field, 'manifest');
  if (manifest.partyCapacity !== 4) throw new TypeError('reference world partyCapacity must be 4');
  if (manifest.physicalEffectPossible !== false) throw new TypeError('prototype physicalEffectPossible must be false');
  if (map.schemaVersion !== 'vexworld.map/v1') throw new TypeError('invalid map schemaVersion');
  if (!Array.isArray(map.platforms) || map.platforms.length === 0) throw new TypeError('map requires platforms');
  if (!Array.isArray(map.restorationPoints) || map.restorationPoints.length === 0) throw new TypeError('map requires restoration points');
  if (laws.schemaVersion !== 'vexworld.world-law/v1') throw new TypeError('invalid laws schemaVersion');
  if (!(laws.gravity > 0)) throw new TypeError('gravity must be positive');
  if (expressions.schemaVersion !== 'vexworld.expression-profile/v1') throw new TypeError('invalid expression schemaVersion');

  const behaviorRefs = new Set(catalogs.behaviors.behaviors.map((entry) => entry.behaviorRef));
  const archetypeRefs = new Set(catalogs.archetypes.archetypes.map((entry) => entry.archetypeRef));
  for (const archetype of catalogs.archetypes.archetypes) {
    for (const ref of archetype.behaviorRefs) if (!behaviorRefs.has(ref)) throw new TypeError(`unknown behavior ${ref}`);
  }
  for (const decoration of map.decorations) if (!archetypeRefs.has(decoration.archetypeRef)) throw new TypeError(`unknown decoration archetype ${decoration.archetypeRef}`);
  if (!catalogs.actions.actions.some((entry) => entry.actionRef === 'action.vexworld.status.open')) throw new TypeError('status action is required');
  if (!catalogs.teamTechniques.techniques.some((entry) => entry.teamTechniqueRef === 'technique.vexworld.high-low')) throw new TypeError('High/Low technique is required');
  for (const scenario of scenarios) {
    if (scenario.schemaVersion !== 'vexworld.scenario/v1') throw new TypeError(`invalid scenario ${scenario.scenarioRef || 'unknown'}`);
    for (const field of ['scenarioRef', 'purpose']) requireString(scenario, field, 'scenario');
    if (!Array.isArray(scenario.expected) || !Array.isArray(scenario.forbidden)) throw new TypeError(`${scenario.scenarioRef} must declare expected and forbidden`);
  }
}

export async function compileFirstGrove({ root = process.cwd() } = {}) {
  const records = {};
  for (const sourceFile of SOURCE_FILES) records[sourceFile] = await readJson(root, sourceFile);
  const scenarioDir = path.join(root, 'worlds/first-grove/scenarios');
  const scenarioNames = (await fs.readdir(scenarioDir)).filter((name) => name.endsWith('.json')).sort();
  const scenarioRecords = [];
  for (const name of scenarioNames) {
    const relativePath = `worlds/first-grove/scenarios/${name}`;
    scenarioRecords.push({ relativePath, ...(await readJson(root, relativePath)) });
  }

  const manifest = records['worlds/first-grove/manifest.json'].value;
  const map = records['worlds/first-grove/map.json'].value;
  const laws = records['worlds/first-grove/laws.json'].value;
  const expressions = records['worlds/first-grove/expressions.json'].value;
  const catalogs = {
    archetypes: records['world/archetypes.json'].value,
    behaviors: records['world/behaviors.json'].value,
    actions: records['world/actions.json'].value,
    practices: records['world/practices.json'].value,
    abilities: records['world/abilities.json'].value,
    teamTechniques: records['world/team-techniques.json'].value
  };
  const scenarios = scenarioRecords.map((record) => record.value);
  validateSource({ manifest, map, laws, expressions, catalogs, scenarios });

  const sourceEntries = [
    ...Object.entries(records).map(([relativePath, record]) => ({ relativePath, sha256: sha256(canonicalSourceText(record.text)) })),
    ...scenarioRecords.map((record) => ({ relativePath: record.relativePath, sha256: sha256(canonicalSourceText(record.text)) }))
  ].sort((a, b) => a.relativePath.localeCompare(b.relativePath));

  const packageBody = sortDeep({
    schemaVersion: 'vexworld.world-package/v1',
    packageRef: 'package.vexworld.first-grove.prototype.v1',
    compiledFrom: sourceEntries,
    manifest,
    map,
    laws,
    expressions,
    catalogs,
    scenarios,
    effects: {
      physicalActuation: false,
      modelTraining: false,
      commerce: false,
      productionNetworking: false
    }
  });
  const integrityFingerprint = sha256(canonicalJson(packageBody));
  return {
    ...packageBody,
    integrityFingerprint
  };
}

export async function writeCompiledFirstGrove({ root = process.cwd(), check = false } = {}) {
  const output = await compileFirstGrove({ root });
  const generatedDir = path.join(root, 'generated');
  const packagePath = path.join(generatedDir, 'first-grove.world-package.json');
  const mapPath = path.join(generatedDir, 'first-grove.source-map.json');
  const packageText = JSON.stringify(output, null, 2) + '\n';
  const sourceMap = {
    schemaVersion: 'vexworld.generated-source-map/v1',
    packageRef: output.packageRef,
    integrityFingerprint: output.integrityFingerprint,
    sources: output.compiledFrom,
    generatedFiles: ['generated/first-grove.world-package.json', 'generated/first-grove.source-map.json']
  };
  const mapText = JSON.stringify(sourceMap, null, 2) + '\n';

  if (check) {
    const [existingPackage, existingMap] = await Promise.all([
      fs.readFile(packagePath, 'utf8'),
      fs.readFile(mapPath, 'utf8')
    ]);
    if (existingPackage !== packageText || existingMap !== mapText) {
      throw new Error('generated First Grove output is stale; run npm run compile');
    }
    return { output, changed: false };
  }

  await fs.mkdir(generatedDir, { recursive: true });
  await Promise.all([
    fs.writeFile(packagePath, packageText),
    fs.writeFile(mapPath, mapText)
  ]);
  return { output, changed: true };
}
