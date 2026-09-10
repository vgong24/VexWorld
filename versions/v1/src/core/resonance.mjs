const FACETS = Object.freeze([
  'coordination',
  'mutualAssistance',
  'sharedPractice',
  'repairAndRecovery',
  'creativeCollaboration',
  'trustedDelegation',
  'playAndExploration'
]);

export function resonanceKey(participantRefs) {
  return [...participantRefs].sort().join('::');
}

export function createBondResonanceProfile(participantRefs) {
  return {
    schemaVersion: 'vexworld.bond-resonance-profile/v1',
    profileRef: `resonance.${participantRefs.map((ref) => ref.split('.').pop()).join('-')}`,
    participantRefs: [...participantRefs],
    scopeRef: 'world.vexworld.first-grove',
    facets: Object.fromEntries(FACETS.map((facet) => [facet, { evidence: 0, eventRefs: [] }])),
    opportunityRefs: [],
    hiddenScalarScore: null,
    coreRightsAffected: false
  };
}

export function recordResonanceEvent(profile, { eventRef, facetDeltas }) {
  for (const [facet, rawDelta] of Object.entries(facetDeltas || {})) {
    if (!profile.facets[facet]) continue;
    const delta = Math.max(0, Number(rawDelta) || 0);
    profile.facets[facet].evidence = Number((profile.facets[facet].evidence + delta).toFixed(3));
    if (eventRef && !profile.facets[facet].eventRefs.includes(eventRef)) {
      profile.facets[facet].eventRefs.push(eventRef);
    }
  }
  return profile;
}

export function resonanceOpportunityEligible(profile, requirements = {}) {
  return Object.entries(requirements).every(([facet, minimum]) =>
    (profile.facets[facet]?.evidence ?? 0) >= minimum
  );
}

export function publicResonanceProjection(profile) {
  return {
    profileRef: profile.profileRef,
    participantRefs: [...profile.participantRefs],
    facets: Object.fromEntries(Object.entries(profile.facets).map(([key, value]) => [key, value.evidence])),
    opportunityRefs: [...profile.opportunityRefs],
    hiddenScalarScore: null,
    coreRightsAffected: false
  };
}
