import { assert } from './utils.mjs';

export function gradeSynchronization(deltaMs, timing) {
  const delta = Math.abs(deltaMs);
  if (delta <= timing.criticalWindowMs) return 'SYNCHRONIZED_CRITICAL';
  if (delta <= timing.excellentWindowMs) return 'EXCELLENT_SYNC';
  if (delta <= timing.goodWindowMs) return 'GOOD_SYNC';
  if (delta <= timing.partialWindowMs) return 'PARTIAL_SYNC';
  return 'BROKEN_OR_ABORTED';
}

export function createTechniqueSignal({ technique, initiatorRef, responderRef, targetRef, nowMs }) {
  assert(technique?.teamTechniqueRef, 'technique is required');
  return {
    signalRef: `signal.${technique.teamTechniqueRef}.${Math.floor(nowMs)}`,
    techniqueRef: technique.teamTechniqueRef,
    initiatorRef,
    responderRef,
    targetRef,
    signalledAt: nowMs,
    idealResponseAt: nowMs + technique.timing.signalLeadMs,
    expiresAt: nowMs + technique.timing.expiresMs,
    state: 'SIGNALLED'
  };
}

export function resolveTechniqueResponse({ signal, responseAt, technique }) {
  assert(signal.state === 'SIGNALLED', 'signal is not active');
  if (responseAt > signal.expiresAt) {
    return { result: 'BROKEN_OR_ABORTED', deltaMs: responseAt - signal.idealResponseAt, reason: 'EXPIRED' };
  }
  const deltaMs = responseAt - signal.idealResponseAt;
  return {
    result: gradeSynchronization(deltaMs, technique.timing),
    deltaMs,
    reason: 'WORLD_TIMING_RESOLUTION'
  };
}

export function techniqueDamage(result) {
  return ({
    PARTIAL_SYNC: 18,
    GOOD_SYNC: 30,
    EXCELLENT_SYNC: 46,
    SYNCHRONIZED_CRITICAL: 72,
    BROKEN_OR_ABORTED: 0
  })[result] ?? 0;
}
