import test from 'node:test';
import assert from 'node:assert/strict';
import { compileFirstGrove } from '../src/compiler/world-compiler.mjs';

test('First Grove compiler is deterministic and engine-neutral', async () => {
  const first = await compileFirstGrove();
  const second = await compileFirstGrove();
  assert.equal(first.integrityFingerprint, second.integrityFingerprint);
  assert.equal(first.manifest.partyCapacity,4);
  assert.equal(first.manifest.physicalEffectPossible,false);
  assert.equal(first.effects.physicalActuation,false);
  assert.ok(first.map.platforms.length>0);
  assert.ok(first.scenarios.length>=5);
});
