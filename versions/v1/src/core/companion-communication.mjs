export const COMPANION_SPEECH_ACTS = Object.freeze([
  'STATUS',
  'COORDINATION',
  'RESOURCE',
  'CHALLENGE',
  'COHESION',
  'REACTION'
]);

export const MAX_COMPANION_UTTERANCE_LENGTH = 180;
export const COMPANION_UTTERANCE_TTL_MS = 6500;

const UTTERANCE_KEYS = new Set([
  'schemaVersion',
  'utteranceRef',
  'participantRef',
  'sequence',
  'formedAt',
  'expiresAt',
  'sourceObservationRef',
  'sourceIntentRef',
  'speechAct',
  'text',
  'controllerDisposition',
  'controllerEvidence'
]);

const CONTROLLER_EVIDENCE_KEYS = new Set([
  'requestedMode',
  'workerId',
  'modelIdentity',
  'fallbackReason'
]);

function nonempty(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function singleLine(value) {
  return nonempty(value) && !/[\r\n\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value);
}

export function speechActForIntent(intentType) {
  return ({
    RETURN_TO_RESTORATION: 'RESOURCE',
    REST: 'RESOURCE',
    SIGNAL_HIGH_LOW: 'COORDINATION',
    ATTACK_NEAREST: 'CHALLENGE',
    FOLLOW_HUMAN: 'COHESION',
    EXPLORE_LEFT: 'STATUS',
    EXPLORE_RIGHT: 'STATUS',
    HOLD_POSITION: 'STATUS'
  })[intentType] || 'REACTION';
}

export function deterministicCommunicationProposal(intent) {
  const text = ({
    RETURN_TO_RESTORATION: "I'm heading back to the Hearth to restore.",
    REST: "I'm taking a moment to restore.",
    SIGNAL_HIGH_LOW: 'High or low? I see an opening.',
    ATTACK_NEAREST: "I'll keep pressure on the nearby threat.",
    FOLLOW_HUMAN: "I'm with you.",
    EXPLORE_LEFT: "I'll check the path to the left.",
    EXPLORE_RIGHT: "I'll check the path to the right.",
    HOLD_POSITION: "I'm here with you."
  })[intent?.intentType] || 'I am here.';
  return { speechAct: speechActForIntent(intent?.intentType), text };
}

export function validateCommunicationProposal(proposal) {
  if (!proposal || typeof proposal !== 'object' || Array.isArray(proposal)) {
    return { valid: false, reason: 'COMMUNICATION_PROPOSAL_NOT_OBJECT' };
  }
  const keys = Object.keys(proposal);
  if (keys.some((key) => !['speechAct', 'text'].includes(key))) {
    return { valid: false, reason: 'COMMUNICATION_PROPOSAL_EXTRA_FIELDS' };
  }
  if (!COMPANION_SPEECH_ACTS.includes(proposal.speechAct)) {
    return { valid: false, reason: 'COMMUNICATION_SPEECH_ACT_UNSUPPORTED' };
  }
  if (!singleLine(proposal.text) || proposal.text.trim().length > MAX_COMPANION_UTTERANCE_LENGTH) {
    return { valid: false, reason: 'COMMUNICATION_TEXT_INVALID' };
  }
  return { valid: true, proposal: { speechAct: proposal.speechAct, text: proposal.text.trim() } };
}

export function validateCompanionUtterance(utterance, { expectedParticipantRef = null } = {}) {
  if (!utterance || typeof utterance !== 'object' || Array.isArray(utterance)) {
    return { valid: false, reason: 'UTTERANCE_NOT_OBJECT' };
  }
  if (Object.keys(utterance).some((key) => !UTTERANCE_KEYS.has(key))) {
    return { valid: false, reason: 'UTTERANCE_EXTRA_FIELDS' };
  }
  if (utterance.schemaVersion !== 'vexworld.companion-utterance/v1') {
    return { valid: false, reason: 'UTTERANCE_SCHEMA_UNSUPPORTED' };
  }
  if (!nonempty(utterance.utteranceRef) || !nonempty(utterance.participantRef)) {
    return { valid: false, reason: 'UTTERANCE_IDENTITY_REQUIRED' };
  }
  if (expectedParticipantRef && utterance.participantRef !== expectedParticipantRef) {
    return { valid: false, reason: 'UTTERANCE_PARTICIPANT_MISMATCH' };
  }
  if (!Number.isInteger(utterance.sequence) || utterance.sequence < 1) {
    return { valid: false, reason: 'UTTERANCE_SEQUENCE_INVALID' };
  }
  if (!Number.isFinite(utterance.formedAt) || !Number.isFinite(utterance.expiresAt) || utterance.expiresAt <= utterance.formedAt) {
    return { valid: false, reason: 'UTTERANCE_TIME_INVALID' };
  }
  if (utterance.expiresAt - utterance.formedAt > 30000) {
    return { valid: false, reason: 'UTTERANCE_TTL_TOO_LONG' };
  }
  if (!nonempty(utterance.sourceObservationRef) || !nonempty(utterance.sourceIntentRef)) {
    return { valid: false, reason: 'UTTERANCE_SOURCE_REQUIRED' };
  }
  const proposal = validateCommunicationProposal({ speechAct: utterance.speechAct, text: utterance.text });
  if (!proposal.valid) return { valid: false, reason: proposal.reason };
  if (!nonempty(utterance.controllerDisposition)) {
    return { valid: false, reason: 'UTTERANCE_CONTROLLER_DISPOSITION_REQUIRED' };
  }
  if (!utterance.controllerEvidence || typeof utterance.controllerEvidence !== 'object' || Array.isArray(utterance.controllerEvidence)) {
    return { valid: false, reason: 'UTTERANCE_CONTROLLER_EVIDENCE_REQUIRED' };
  }
  if (Object.keys(utterance.controllerEvidence).some((key) => !CONTROLLER_EVIDENCE_KEYS.has(key))) {
    return { valid: false, reason: 'UTTERANCE_CONTROLLER_EVIDENCE_EXTRA_FIELDS' };
  }
  if (!nonempty(utterance.controllerEvidence.workerId) || !nonempty(utterance.controllerEvidence.requestedMode)) {
    return { valid: false, reason: 'UTTERANCE_CONTROLLER_EVIDENCE_INCOMPLETE' };
  }
  return { valid: true };
}

export function formCompanionUtterance({
  participantRef,
  sequence,
  formedAt,
  sourceObservationRef,
  sourceIntentRef,
  proposal,
  controllerDisposition,
  controllerEvidence
}) {
  const normalized = validateCommunicationProposal(proposal);
  if (!normalized.valid) throw new TypeError(normalized.reason);
  const utterance = {
    schemaVersion: 'vexworld.companion-utterance/v1',
    utteranceRef: `utterance.${participantRef}.${sequence}`,
    participantRef,
    sequence,
    formedAt,
    expiresAt: formedAt + COMPANION_UTTERANCE_TTL_MS,
    sourceObservationRef,
    sourceIntentRef,
    speechAct: normalized.proposal.speechAct,
    text: normalized.proposal.text,
    controllerDisposition,
    controllerEvidence: {
      requestedMode: controllerEvidence.requestedMode,
      workerId: controllerEvidence.workerId,
      modelIdentity: controllerEvidence.modelIdentity || null,
      fallbackReason: controllerEvidence.fallbackReason || null
    }
  };
  const result = validateCompanionUtterance(utterance, { expectedParticipantRef: participantRef });
  if (!result.valid) throw new TypeError(result.reason);
  return utterance;
}
