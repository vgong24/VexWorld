#!/usr/bin/env node
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const adapterRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

async function readJson(relativePath) {
  return JSON.parse(await fs.readFile(path.join(adapterRoot, relativePath), 'utf8'));
}

function sortedKeys(value) {
  return Object.keys(value ?? {}).sort();
}

export async function proveHumanExpressionReplacement() {
  const [a, b] = await Promise.all([
    readJson('expressions/original-human-reference.json'),
    readJson('expressions/original-human-reference-alt.json')
  ]);

  const stable = {
    characterRefOrArchetypeRef: a.characterRefOrArchetypeRef === b.characterRefOrArchetypeRef,
    vesselRef: a.vesselRef === b.vesselRef,
    topologyRef: a.topologyRef === b.topologyRef,
    semanticSockets: JSON.stringify(sortedKeys(a.socketBindings)) === JSON.stringify(sortedKeys(b.socketBindings)),
    semanticAnimationIntents: JSON.stringify(sortedKeys(a.animationIntentBindings)) === JSON.stringify(sortedKeys(b.animationIntentBindings)),
    expressionActuallyChanged: a.expressionBindingRef !== b.expressionBindingRef && a.silhouetteAndReadabilityProfileRef !== b.silhouetteAndReadabilityProfileRef
  };
  const passed = Object.values(stable).every(Boolean);

  return {
    schemaVersion: 'vexworld.expression-replacement-proof/v1',
    proofRef: 'proof.vexworld.human-reference-expression-replacement.v1',
    beforeExpressionRef: a.expressionBindingRef,
    afterExpressionRef: b.expressionBindingRef,
    preservedCharacterRefOrArchetypeRef: a.characterRefOrArchetypeRef,
    preservedVesselRef: a.vesselRef,
    preservedTopologyRef: a.topologyRef,
    checks: stable,
    disposition: passed ? 'REPLACEMENT_PRESERVES_SEMANTIC_IDENTITY' : 'REPLACEMENT_PROOF_FAILED',
    whatItProves: [
      'two distinct VexWorld-owned expression bindings can replace one another without changing the semantic character archetype, vessel or topology',
      'semantic sockets and animation intents survive expression replacement'
    ],
    whatItDoesNotProve: [
      'external asset provenance or license acceptance',
      'final art quality',
      'human game feel',
      'universal 3D retargeting compatibility'
    ]
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  proveHumanExpressionReplacement().then((receipt) => {
    console.log(JSON.stringify(receipt, null, 2));
    if (receipt.disposition !== 'REPLACEMENT_PRESERVES_SEMANTIC_IDENTITY') process.exitCode = 2;
  }).catch((error) => {
    console.error(error.stack || error.message);
    process.exitCode = 1;
  });
}
