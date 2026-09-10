import test from 'node:test';
import assert from 'node:assert/strict';
import { createTechniqueSignal, gradeSynchronization, resolveTechniqueResponse, techniqueDamage } from '../src/core/team-technique.mjs';

const technique = {
  teamTechniqueRef: 'technique.vexworld.high-low',
  timing: { signalLeadMs:650, criticalWindowMs:45, excellentWindowMs:100, goodWindowMs:220, partialWindowMs:350, expiresMs:1300 }
};

test('synchronized critical is earned from actual timing', () => {
  assert.equal(gradeSynchronization(20, technique.timing), 'SYNCHRONIZED_CRITICAL');
  assert.equal(gradeSynchronization(80, technique.timing), 'EXCELLENT_SYNC');
  assert.equal(gradeSynchronization(180, technique.timing), 'GOOD_SYNC');
  assert.equal(gradeSynchronization(320, technique.timing), 'PARTIAL_SYNC');
  assert.equal(gradeSynchronization(500, technique.timing), 'BROKEN_OR_ABORTED');
  assert.ok(techniqueDamage('SYNCHRONIZED_CRITICAL') > techniqueDamage('GOOD_SYNC'));
});

test('a signal does not guarantee execution', () => {
  const signal = createTechniqueSignal({ technique, initiatorRef:'vex', responderRef:'victor', targetRef:'enemy', nowMs:1000 });
  const result = resolveTechniqueResponse({ signal, responseAt:2400, technique });
  assert.equal(result.result, 'BROKEN_OR_ABORTED');
  assert.equal(result.reason, 'EXPIRED');
});
