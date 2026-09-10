import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyReturnMargin, updateResourceProjection } from '../src/core/resource-state.mjs';

const member = {
  body: { x: 1000, y: 500 },
  resources: { energy: 22, maxEnergy: 100, reserveRequired: 12, restorationMethods: ['dock'] }
};
const world = {
  map: { restorationPoints: [{ entityRef:'rest', x:0, y:500, methods:['dock'] }] },
  weather: { state: 'RAIN' },
  laws: { movement: { companionSpeed: 200 }, resource: { moveCostPerSecond:.6, rainMultiplier:1.4 } }
};

test('return margin considers reachable compatible restoration and environment', () => {
  const result = updateResourceProjection(member, world);
  assert.equal(result.nearest.entityRef, 'rest');
  assert.ok(result.predictedReturnCost > 0);
  assert.notEqual(result.band, 'AVAILABLE_MARGIN');
});

test('resource bands are calm margin classes rather than battery-only thresholds', () => {
  assert.equal(classifyReturnMargin({ margin: 60, maxEnergy:100, requiredReserve:12 }), 'AVAILABLE_MARGIN');
  assert.equal(classifyReturnMargin({ margin: 15, maxEnergy:100, requiredReserve:12 }), 'RESTORATION_RECOMMENDED');
  assert.equal(classifyReturnMargin({ margin: 5, maxEnergy:100, requiredReserve:12 }), 'RETURN_MARGIN_LOW');
  assert.equal(classifyReturnMargin({ margin: -1, maxEnergy:100, requiredReserve:12 }), 'PROTECTIVE_RETURN_OR_HALT');
});
