import test from 'node:test';
import assert from 'node:assert/strict';

import { validateCharacterAdapter } from '../adapters/characters/tools/validate-character-adapter.mjs';
import { proveHumanExpressionReplacement } from '../adapters/characters/tools/replacement-proof.mjs';

test('Stage C original character/vessel grammar validates without external asset dependency', async () => {
  const receipt = await validateCharacterAdapter();
  assert.equal(receipt.disposition, 'CHARACTER_ADAPTER_VALID', receipt.errors.join('\n'));
  assert.deepEqual(receipt.errors, []);
  assert.ok(receipt.topologyRefs.includes('topology.vexworld.biped-humanoid.reference.v1'));
  assert.ok(receipt.topologyRefs.includes('topology.vexworld.floating-companion.reference.v1'));
  assert.ok(receipt.expressionRefs.includes('expression.vexworld.original-human-reference.v1'));
  assert.ok(receipt.expressionRefs.includes('expression.vexworld.original-companion-reference.v1'));
});

test('replacing a human expression does not replace semantic identity or capability surface', async () => {
  const receipt = await proveHumanExpressionReplacement();
  assert.equal(receipt.disposition, 'REPLACEMENT_PRESERVES_SEMANTIC_IDENTITY');
  assert.equal(receipt.preservedVesselRef, 'vessel.first-grove.human.reference');
  assert.ok(Object.values(receipt.checks).every(Boolean));
});

// [VXG RealForever]
