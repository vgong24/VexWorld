import { clamp } from './utils.mjs';

const DIMENSION_WEIGHTS = Object.freeze({
  success: 1,
  difficulty: 1.25,
  novelty: 1.5,
  targetVariety: 1.2,
  environmentVariety: 1.2,
  recovery: 1.4,
  teaching: 1.5,
  transfer: 1.8,
  combination: 1.3
});

export function ensurePractice(member, practiceRef) {
  if (!member.practice[practiceRef]) {
    member.practice[practiceRef] = {
      practiceRef,
      rawAttempts: 0,
      meaningfulEvents: 0,
      evidence: 0,
      distinctTargets: [],
      distinctContexts: [],
      recoveryCount: 0,
      transferCount: 0,
      tier: 'NEW'
    };
  }
  return member.practice[practiceRef];
}

export function recordPractice(member, practiceRef, event = {}) {
  const practice = ensurePractice(member, practiceRef);
  practice.rawAttempts += 1;
  const targetId = event.targetRef || null;
  const contextId = event.contextRef || null;
  const newTarget = targetId && !practice.distinctTargets.includes(targetId);
  const newContext = contextId && !practice.distinctContexts.includes(contextId);
  if (newTarget) practice.distinctTargets.push(targetId);
  if (newContext) practice.distinctContexts.push(contextId);

  const repetitionDiminisher = 1 / Math.sqrt(Math.max(1, practice.rawAttempts / 4));
  let value = 0.15 * repetitionDiminisher;
  value += event.success ? DIMENSION_WEIGHTS.success : 0;
  value += clamp(Number(event.difficulty || 0), 0, 2) * DIMENSION_WEIGHTS.difficulty;
  value += (event.novel || newContext ? 1 : 0) * DIMENSION_WEIGHTS.novelty;
  value += (newTarget ? 1 : 0) * DIMENSION_WEIGHTS.targetVariety;
  value += (newContext ? 1 : 0) * DIMENSION_WEIGHTS.environmentVariety;
  value += (event.recovery ? 1 : 0) * DIMENSION_WEIGHTS.recovery;
  value += (event.teaching ? 1 : 0) * DIMENSION_WEIGHTS.teaching;
  value += (event.transfer ? 1 : 0) * DIMENSION_WEIGHTS.transfer;
  value += (event.combination ? 1 : 0) * DIMENSION_WEIGHTS.combination;

  if (value >= 1) practice.meaningfulEvents += 1;
  if (event.recovery) practice.recoveryCount += 1;
  if (event.transfer) practice.transferCount += 1;
  practice.evidence = Number((practice.evidence + value).toFixed(3));
  practice.tier = classifyPractice(practice.evidence);
  return practice;
}

export function classifyPractice(evidence) {
  if (evidence >= 45) return 'MASTERED_CANDIDATE';
  if (evidence >= 24) return 'PROFICIENT';
  if (evidence >= 12) return 'PRACTICED';
  if (evidence >= 4) return 'FAMILIAR';
  return 'NEW';
}
