import { resonanceOpportunityEligible } from './resonance.mjs';

const FORBIDDEN_KEYS = new Set([
  'affectionScore',
  'loveScore',
  'loyaltyScore',
  'moralityScore',
  'humanWorthScore',
  'obedienceScore',
  'privateRelationshipMemory'
]);

function containsForbiddenKey(value) {
  if (!value || typeof value !== 'object') return false;
  for (const [key, nested] of Object.entries(value)) {
    if (FORBIDDEN_KEYS.has(key)) return true;
    if (containsForbiddenKey(nested)) return true;
  }
  return false;
}

export function createWorldWitnessState() {
  return {
    schemaVersion: 'vexworld.world-witness-state/v1',
    eligibleEvents: [],
    candidateSeeds: [],
    nextSequence: 1
  };
}

export function witnessEligibleEvent(state, event) {
  if (containsForbiddenKey(event)) {
    return { accepted: false, reason: 'FORBIDDEN_HIDDEN_SCORING_OR_PRIVATE_MEMORY' };
  }
  if (!event?.eventRef || event.eligible !== true) {
    return { accepted: false, reason: 'EVENT_NOT_ELIGIBLE' };
  }
  if (!state.eligibleEvents.some((existing) => existing.eventRef === event.eventRef)) {
    state.eligibleEvents.push({ ...event });
  }
  return { accepted: true };
}

export function maybeFormTwinHorizonSeed({ state, resonanceProfile, laws }) {
  const pairSlug = [...resonanceProfile.participantRefs].map((ref) => ref.split('.').pop()).sort().join('-');
  const seedRef = `technique-seed.first-grove.twin-horizon.${pairSlug}`;
  if (state.candidateSeeds.some((seed) => seed.techniqueSeedRef === seedRef)) {
    return null;
  }
  const expectedPair = [...resonanceProfile.participantRefs].sort().join('::');
  const syncEvents = state.eligibleEvents.filter((event) =>
    event.patternClass === 'HIGH_LOW_COORDINATION' &&
    ['GOOD_SYNC', 'EXCELLENT_SYNC', 'SYNCHRONIZED_CRITICAL'].includes(event.result) &&
    [...(event.participantRefs || [])].sort().join('::') === expectedPair
  );
  const distinctTargets = new Set(syncEvents.map((event) => event.targetRef));
  const resonanceReady = resonanceOpportunityEligible(resonanceProfile, {
    coordination: 3,
    sharedPractice: 2
  });
  if (
    syncEvents.length < laws.worldWitness.minimumEligibleSyncEvents ||
    distinctTargets.size < laws.worldWitness.minimumDistinctTargets ||
    !resonanceReady
  ) return null;

  const seed = {
    schemaVersion: 'vexworld.technique-seed/v1',
    techniqueSeedRef: seedRef,
    state: 'TRIAL_READY',
    originWorldRef: 'world.vexworld.first-grove',
    originParticipantRefs: [...resonanceProfile.participantRefs],
    witnessEventRefs: syncEvents.map((event) => event.eventRef),
    observedPatternSummary: 'The pair repeatedly creates complementary high and low openings with improving timing across distinct targets.',
    interpretationCandidate: 'A two-direction resonance wave may make their existing coordination more expressive without replacing their timing skill.',
    confidence: 'BOUNDED_PROTOTYPE',
    proposedAbilityRef: 'ability.vexworld.twin-horizon',
    privacyAndUseDisposition: 'PRIVATE_PAIR',
    effects: {
      learnedAbilityGranted: false,
      questPublishedPublicly: false,
      executableCodeInstalled: false,
      modelTrained: false,
      physicalEffect: false
    },
    incubationGeneration: 0,
    scenarioRefs: ['scenario.first-grove.world-witness']
  };
  state.candidateSeeds.push(seed);
  return seed;
}
