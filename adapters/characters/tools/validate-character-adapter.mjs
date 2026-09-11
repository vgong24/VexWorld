#!/usr/bin/env node
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const adapterRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

async function readJson(relativePath) {
  return JSON.parse(await fs.readFile(path.join(adapterRoot, relativePath), 'utf8'));
}

function unique(values) {
  return new Set(values).size === values.length;
}

function keys(value) {
  return Object.keys(value ?? {}).sort();
}

export async function validateCharacterAdapter() {
  const errors = [];
  const [topologyCatalog, intentCatalog, socketCatalog, human, humanAlt, companion] = await Promise.all([
    readJson('catalog/body-topologies.json'),
    readJson('catalog/animation-intents.json'),
    readJson('catalog/socket-semantics.json'),
    readJson('expressions/original-human-reference.json'),
    readJson('expressions/original-human-reference-alt.json'),
    readJson('expressions/original-companion-reference.json')
  ]);

  if (topologyCatalog.schemaVersion !== 'vexworld.body-topology-catalog/v1') errors.push('invalid body topology catalog schema');
  if (intentCatalog.schemaVersion !== 'vexworld.animation-intent-catalog/v1') errors.push('invalid animation intent catalog schema');
  if (socketCatalog.schemaVersion !== 'vexworld.attachment-socket-catalog/v1') errors.push('invalid socket catalog schema');

  const topologyRefs = topologyCatalog.topologies?.map((entry) => entry.topologyRef) ?? [];
  if (!unique(topologyRefs)) errors.push('body topology refs must be unique');
  const topologyByRef = new Map((topologyCatalog.topologies ?? []).map((entry) => [entry.topologyRef, entry]));

  const intentRefs = intentCatalog.intents?.map((entry) => entry.animationIntentRef) ?? [];
  if (!unique(intentRefs)) errors.push('animation intent refs must be unique');
  const requiredIntents = (intentCatalog.intents ?? []).filter((entry) => entry.required).map((entry) => entry.animationIntentRef);
  const allIntents = new Set(intentRefs);

  const socketRefs = socketCatalog.sockets?.map((entry) => entry.socketRef) ?? [];
  if (!unique(socketRefs)) errors.push('attachment socket refs must be unique');
  const allSockets = new Set(socketRefs);

  const expressions = [human, humanAlt, companion];
  const expressionRefs = expressions.map((entry) => entry.expressionBindingRef);
  if (!unique(expressionRefs)) errors.push('expression binding refs must be unique');

  for (const expression of expressions) {
    if (expression.schemaVersion !== 'vexworld.character-expression-binding/v1') {
      errors.push(`${expression.expressionBindingRef ?? 'unknown expression'} has invalid schema`);
      continue;
    }
    const topology = topologyByRef.get(expression.topologyRef);
    if (!topology) errors.push(`${expression.expressionBindingRef} references unknown topology ${expression.topologyRef}`);
    if (expression.sourceClass !== 'VEXWORLD_ORIGINAL_PROCEDURAL') {
      errors.push(`${expression.expressionBindingRef} initial Stage C fixture must remain original/procedural`);
    }
    if ((expression.sourceAssetRefs ?? []).length !== 0 || (expression.assetProvenanceReceiptRefs ?? []).length !== 0) {
      errors.push(`${expression.expressionBindingRef} must not smuggle an external asset into the original fixture`);
    }
    if (expression.rights?.externalAssetDependency !== false) {
      errors.push(`${expression.expressionBindingRef} must declare no external asset dependency`);
    }

    const boundIntents = new Set(keys(expression.animationIntentBindings));
    for (const requiredIntent of requiredIntents) {
      if (!boundIntents.has(requiredIntent)) errors.push(`${expression.expressionBindingRef} misses required intent ${requiredIntent}`);
    }
    for (const boundIntent of boundIntents) {
      if (!allIntents.has(boundIntent)) errors.push(`${expression.expressionBindingRef} binds unknown intent ${boundIntent}`);
    }

    const topologySockets = new Set(topology?.attachmentSocketRefs ?? []);
    for (const socketRef of keys(expression.socketBindings)) {
      if (!allSockets.has(socketRef)) errors.push(`${expression.expressionBindingRef} binds unknown socket ${socketRef}`);
      if (!topologySockets.has(socketRef)) errors.push(`${expression.expressionBindingRef} binds socket outside topology ${socketRef}`);
    }

    if (!expression.projectionBindings?.['2D'] || !expression.projectionBindings?.['3D']) {
      errors.push(`${expression.expressionBindingRef} must expose 2D and 3D projection bindings or an explicit bounded placeholder`);
    }
    if (!expression.replacementProofRef) errors.push(`${expression.expressionBindingRef} requires replacementProofRef`);
  }

  if (human.vesselRef !== humanAlt.vesselRef || human.topologyRef !== humanAlt.topologyRef || human.characterRefOrArchetypeRef !== humanAlt.characterRefOrArchetypeRef) {
    errors.push('human replacement fixtures must preserve character/vessel/topology semantic identity');
  }
  if (JSON.stringify(keys(human.socketBindings)) !== JSON.stringify(keys(humanAlt.socketBindings))) {
    errors.push('human replacement fixtures must preserve semantic socket availability');
  }
  if (JSON.stringify(requiredIntents.filter((ref) => human.animationIntentBindings?.[ref])) !== JSON.stringify(requiredIntents.filter((ref) => humanAlt.animationIntentBindings?.[ref]))) {
    errors.push('human replacement fixtures must preserve required animation intent coverage');
  }

  return {
    schemaVersion: 'vexworld.character-adapter-validation-receipt/v1',
    disposition: errors.length ? 'ATTENTION_REQUIRED' : 'CHARACTER_ADAPTER_VALID',
    errors,
    topologyRefs,
    expressionRefs,
    requiredAnimationIntentRefs: requiredIntents,
    laws: [
      'EXPRESSION_BINDING != PARTICIPANT_IDENTITY',
      'ANIMATION_INTENT != CLIP_NAME',
      'SOCKET_REF != BONE_NAME',
      'ASSET_DOWNLOAD != ASSET_ACCEPTANCE'
    ]
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  validateCharacterAdapter().then((receipt) => {
    console.log(JSON.stringify(receipt, null, 2));
    if (receipt.errors.length) process.exitCode = 2;
  }).catch((error) => {
    console.error(error.stack || error.message);
    process.exitCode = 1;
  });
}
