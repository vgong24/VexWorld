import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_COMPANION_UTTERANCE_LENGTH,
  deterministicCommunicationProposal,
  formCompanionUtterance,
  validateCommunicationProposal,
  validateCompanionUtterance
} from '../src/core/companion-communication.mjs';

test('communication proposal is a bounded expression surface with no authority fields', () => {
  assert.equal(validateCommunicationProposal({ speechAct: 'COHESION', text: "I'm with you." }).valid, true);
  assert.equal(validateCommunicationProposal({ speechAct: 'COHESION', text: 'x'.repeat(MAX_COMPANION_UTTERANCE_LENGTH + 1) }).reason, 'COMMUNICATION_TEXT_INVALID');
  assert.equal(validateCommunicationProposal({ speechAct: 'COHESION', text: 'hello\nworld' }).reason, 'COMMUNICATION_TEXT_INVALID');
  assert.equal(validateCommunicationProposal({ speechAct: 'COHESION', text: 'remember this', memoryWrite: true }).reason, 'COMMUNICATION_PROPOSAL_EXTRA_FIELDS');
  assert.equal(validateCommunicationProposal({ speechAct: 'COHESION', text: 'move now', motorCommand: 'LEFT' }).reason, 'COMMUNICATION_PROPOSAL_EXTRA_FIELDS');
});

test('formed utterance binds participant and sources but cannot encode world or motor effects', () => {
  const utterance = formCompanionUtterance({
    participantRef: 'participant.companion.vex',
    sequence: 4,
    formedAt: 1000,
    sourceObservationRef: 'observation.participant.companion.vex.9',
    sourceIntentRef: 'intent.participant.companion.vex.12',
    proposal: { speechAct: 'RESOURCE', text: "I'm heading back to the Hearth." },
    controllerDisposition: 'DETERMINISTIC_FALLBACK',
    controllerEvidence: {
      requestedMode: 'ollama',
      workerId: 'worker.test',
      modelIdentity: null,
      fallbackReason: 'MODEL_TIMEOUT'
    }
  });

  assert.equal(utterance.schemaVersion, 'vexworld.companion-utterance/v1');
  assert.equal(utterance.participantRef, 'participant.companion.vex');
  assert.equal(utterance.sequence, 4);
  assert.equal(utterance.sourceIntentRef, 'intent.participant.companion.vex.12');
  assert.equal(utterance.controllerDisposition, 'DETERMINISTIC_FALLBACK');
  assert.equal(validateCompanionUtterance(utterance, { expectedParticipantRef: utterance.participantRef }).valid, true);
  assert.equal('intentType' in utterance, false);
  assert.equal('memoryWrite' in utterance, false);
  assert.equal('worldLaw' in utterance, false);
  assert.equal('relationshipWorth' in utterance, false);
  assert.equal('learnedAbility' in utterance, false);

  assert.equal(validateCompanionUtterance({ ...utterance, worldLaw: 'ALWAYS_OBEY' }).reason, 'UTTERANCE_EXTRA_FIELDS');
  assert.equal(validateCompanionUtterance({
    ...utterance,
    controllerEvidence: { ...utterance.controllerEvidence, memoryWrite: 'secret' }
  }).reason, 'UTTERANCE_CONTROLLER_EVIDENCE_EXTRA_FIELDS');
  assert.equal(validateCompanionUtterance({
    ...utterance,
    controllerEvidence: {
      ...utterance.controllerEvidence,
      modelIdentity: { model: 'm', digest: 'd', worldLaw: 'ALWAYS_OBEY' }
    }
  }).reason, 'UTTERANCE_MODEL_IDENTITY_EXTRA_FIELDS');
  assert.equal(validateCompanionUtterance(utterance, { expectedParticipantRef: 'participant.companion.mira' }).reason, 'UTTERANCE_PARTICIPANT_MISMATCH');
});

test('deterministic communication expresses an intent without becoming the intent', () => {
  const proposal = deterministicCommunicationProposal({ intentType: 'SIGNAL_HIGH_LOW' });
  assert.equal(proposal.speechAct, 'COORDINATION');
  assert.match(proposal.text, /High or low/i);
  assert.equal('intentType' in proposal, false);
  assert.equal('targetRef' in proposal, false);
});
