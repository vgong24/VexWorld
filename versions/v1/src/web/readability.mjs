// Projection-only readability grammar for First Grove.
// These helpers may improve labels, silhouettes and visual hierarchy, but they
// do not own participant identity, party membership, capability or world law.

export const READABILITY_ROLES = Object.freeze({
  HUMAN: 'PLAYER_PRIMARY',
  COMPANION: 'PARTY_COMPANION',
  ENEMY: 'WORLD_CHALLENGE',
  INTERACTABLE: 'WORLD_INTERACTABLE',
  LANDMARK: 'WORLD_LANDMARK'
});

export const PARTY_LABEL_LANES = Object.freeze([
  Object.freeze({ x: 0, y: 0 }),
  Object.freeze({ x: -52, y: -22 }),
  Object.freeze({ x: 0, y: -44 }),
  Object.freeze({ x: 52, y: -22 })
]);

export const PARTY_SLOT_MARKERS = Object.freeze(['YOU', '1', '2', '3']);

export function partyLabelPlacement(member) {
  const slot = Number.isInteger(member?.partySlot) ? member.partySlot : 0;
  const lane = PARTY_LABEL_LANES[slot] || PARTY_LABEL_LANES[0];
  const halfHeight = Number(member?.body?.height || 64) / 2;
  return Object.freeze({
    xOffset: member?.participantType === 'HUMAN' ? 0 : lane.x,
    yOffset: -halfHeight - 18 + lane.y,
    marker: member?.participantType === 'HUMAN' ? PARTY_SLOT_MARKERS[0] : (PARTY_SLOT_MARKERS[slot] || '?')
  });
}

export function partyFocusRing(member) {
  const human = member?.participantType === 'HUMAN';
  return Object.freeze({
    radiusX: human ? 25 : 22,
    radiusY: human ? 8 : 7,
    lineWidth: human ? 3 : 2,
    dash: human ? [] : [4, 4],
    alpha: human ? 0.9 : 0.7
  });
}

export function bubbleLayoutClass(count) {
  if (!Number.isInteger(count) || count <= 0) return 'dialogue-density-none';
  if (count === 1) return 'dialogue-density-single';
  if (count === 2) return 'dialogue-density-pair';
  return 'dialogue-density-full-party';
}

export function artDirectionDecision() {
  return Object.freeze({
    route: 'ORIGINAL_PROCEDURAL_REFINEMENT',
    externalAssetAcceptance: 'NONE',
    rationale: 'Current readability defects are projection/layout/contrast defects and do not require importing a third-party identity or rig.',
    referenceCandidatesHeld: [
      'research-candidate.quaternius.universal-base-characters.2025-08',
      'research-candidate.kaykit.adventurers.free.2.0'
    ]
  });
}
