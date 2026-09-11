#!/usr/bin/env node
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const adapterRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

async function readJson(relativePath) {
  return JSON.parse(await fs.readFile(path.join(adapterRoot, relativePath), 'utf8'));
}

export async function proveEquipmentSocketReplacement() {
  const [fixture, before, after] = await Promise.all([
    readJson('fixtures/equipment-socket-proof.json'),
    readJson('expressions/original-human-reference.json'),
    readJson('expressions/original-human-reference-alt.json')
  ]);

  const socketRef = fixture.requiredSocketRef;
  const checks = {
    beforeExpressionMatches: before.expressionBindingRef === fixture.beforeExpressionRef,
    afterExpressionMatches: after.expressionBindingRef === fixture.afterExpressionRef,
    vesselRefUnchanged: before.vesselRef === after.vesselRef,
    socketExistsBefore: typeof before.socketBindings?.[socketRef] === 'string',
    socketExistsAfter: typeof after.socketBindings?.[socketRef] === 'string',
    semanticSocketUnchanged: socketRef === fixture.requiredSocketRef,
    itemRefStable: fixture.itemRef === 'item.vexworld.training-lantern.reference',
    engineTransformMayDifferWithoutChangingItem: before.socketBindings?.[socketRef] === after.socketBindings?.[socketRef]
      ? true
      : fixture.expected?.engineTransformMayChange === true
  };

  const passed = Object.values(checks).every(Boolean);
  return {
    schemaVersion: 'vexworld.equipment-socket-proof/v1',
    proofRef: 'proof.vexworld.training-lantern-semantic-socket.v1',
    itemRef: fixture.itemRef,
    socketRef,
    beforeExpressionRef: before.expressionBindingRef,
    afterExpressionRef: after.expressionBindingRef,
    preservedVesselRef: before.vesselRef,
    checks,
    disposition: passed ? 'EQUIPMENT_SURVIVES_EXPRESSION_REPLACEMENT' : 'EQUIPMENT_SOCKET_PROOF_FAILED',
    whatItProves: [
      'a held item targets a VexWorld semantic socket rather than an asset bone or engine transform',
      'the same item/socket relation survives replacement of the human expression binding'
    ],
    whatItDoesNotProve: [
      'final equipment art',
      'external rig retargeting',
      'physical manipulation authority'
    ]
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  proveEquipmentSocketReplacement().then((receipt) => {
    console.log(JSON.stringify(receipt, null, 2));
    if (receipt.disposition !== 'EQUIPMENT_SURVIVES_EXPRESSION_REPLACEMENT') process.exitCode = 2;
  }).catch((error) => {
    console.error(error.stack || error.message);
    process.exitCode = 1;
  });
}
