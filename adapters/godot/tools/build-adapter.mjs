#!/usr/bin/env node
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { compileFirstGrove } from '../../../versions/v1/src/compiler/world-compiler.mjs';
import { updateResourceProjection } from '../../../versions/v1/src/core/resource-state.mjs';

const adapterRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = path.resolve(adapterRoot, '../..');
const versionRoot = path.join(repoRoot, 'versions', 'v1');
const characterAdapterRoot = path.join(repoRoot, 'adapters', 'characters');
const generatedRoot = path.join(adapterRoot, 'generated');

async function writeJson(name, value) {
  await fs.mkdir(generatedRoot, { recursive: true });
  await fs.writeFile(path.join(generatedRoot, name), `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

async function readCharacterExpression(fileName) {
  return JSON.parse(await fs.readFile(path.join(characterAdapterRoot, 'expressions', fileName), 'utf8'));
}

function referenceProjection(worldPackage, weather, fixture) {
  const member = {
    body: { x: fixture.restorationDistance, y: 0 },
    resources: {
      energy: fixture.companionEnergy,
      maxEnergy: worldPackage.laws.resource.maxEnergy,
      reserveRequired: worldPackage.laws.resource.requiredReserve,
      restorationMethods: ['restoration.vextory.sunlight']
    }
  };
  const world = {
    map: {
      restorationPoints: [{
        x: 0,
        y: 0,
        methods: ['restoration.vextory.sunlight'],
        entityRef: 'fixture.parity.restoration'
      }]
    },
    laws: worldPackage.laws,
    weather: { state: weather }
  };
  const result = updateResourceProjection(member, world);
  return {
    predictedReturnCost: result.predictedReturnCost,
    returnMargin: result.returnMargin,
    band: result.band
  };
}

export async function buildAdapter() {
  const worldPackage = await compileFirstGrove({ root: versionRoot });
  const sourceMap = JSON.parse(await fs.readFile(path.join(versionRoot, 'generated', 'first-grove.source-map.json'), 'utf8'));
  if (sourceMap.integrityFingerprint !== worldPackage.integrityFingerprint) {
    throw new Error('Version 1 committed generated-source fingerprint disagrees with canonical compile');
  }

  const [humanExpression, companionExpression] = await Promise.all([
    readCharacterExpression('original-human-reference.json'),
    readCharacterExpression('original-companion-reference.json')
  ]);
  const characterExpressions = {
    schemaVersion: 'vexworld.godot-character-expression-projection/v1',
    semanticOwner: 'VEXWORLD_CHARACTER_VESSEL_ADAPTER',
    engineRole: 'REPLACEABLE_REALIZATION_ADAPTER',
    bindings: {
      human: humanExpression,
      companion: companionExpression
    },
    laws: [
      'EXPRESSION_BINDING != PARTICIPANT_IDENTITY',
      'VESSEL_REF != GODOT_NODE',
      'ANIMATION_INTENT != CLIP_NAME'
    ]
  };

  const fixture = {
    companionEnergy: 38,
    restorationDistance: 620
  };
  const parity = {
    schemaVersion: 'vexworld.reference-parity-fixture/v1',
    scenarioRef: 'scenario.first-grove.rain-restoration',
    sourcePackageRef: worldPackage.packageRef,
    sourcePackageFingerprint: worldPackage.integrityFingerprint,
    referenceImplementation: 'versions/v1/src/core/resource-state.mjs',
    fixture,
    expected: {
      CLEAR: referenceProjection(worldPackage, 'CLEAR', fixture),
      RAIN: referenceProjection(worldPackage, 'RAIN', fixture)
    }
  };

  const adapterManifest = {
    schemaVersion: 'vexworld.godot-adapter-build/v1',
    adapterRef: 'adapter.vexworld.godot.first-grove.v0',
    engineRef: 'technology.godot.4.7.2-stable',
    sourcePackageRef: worldPackage.packageRef,
    sourcePackageFingerprint: worldPackage.integrityFingerprint,
    canonicalMeaningOwner: 'VEXWORLD_WORLD_PACKAGE',
    characterExpressionOwner: 'VEXWORLD_CHARACTER_VESSEL_ADAPTER',
    engineRole: 'REPLACEABLE_REALIZATION_ADAPTER',
    characterExpressionRefs: [
      humanExpression.expressionBindingRef,
      companionExpression.expressionBindingRef
    ],
    generatedFiles: [
      'generated/first-grove.world-package.json',
      'generated/reference-parity.json',
      'generated/character-expressions.json',
      'generated/adapter-manifest.json'
    ],
    externalAssetRefs: [],
    effects: {
      modelTraining: false,
      productionNetworking: false,
      physicalActuation: false,
      commerce: false
    }
  };

  await writeJson('first-grove.world-package.json', worldPackage);
  await writeJson('reference-parity.json', parity);
  await writeJson('character-expressions.json', characterExpressions);
  await writeJson('adapter-manifest.json', adapterManifest);
  return { worldPackage, parity, characterExpressions, adapterManifest };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  buildAdapter()
    .then(({ adapterManifest }) => {
      console.log(`BUILT ${adapterManifest.adapterRef} packageFingerprint=${adapterManifest.sourcePackageFingerprint} characterExpressions=${adapterManifest.characterExpressionRefs.join(',')}`);
    })
    .catch((error) => {
      console.error(error.stack || error.message);
      process.exitCode = 1;
    });
}
