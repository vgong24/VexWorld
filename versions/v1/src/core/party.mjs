import { CONTROLLER_CLASSES, PARTY_MAX_SIZE } from './constants.mjs';
import { assert, deepClone } from './utils.mjs';

const FORM_DEFAULTS = Object.freeze({
  human: 'WANDERER',
  companion: 'WISP'
});

export function createParticipant({
  participantRef,
  participantType,
  displayName,
  lineageRef = null,
  homeUniverseRef = null,
  avatarForm,
  color = '#ffffff',
  controllerClass,
  controllerEndpoint = null,
  slotIndex,
  spawn,
  maxEnergy = 100
}) {
  assert(typeof participantRef === 'string' && participantRef.length > 0, 'participantRef is required');
  assert(['HUMAN', 'AI_COMPANION'].includes(participantType), 'invalid participantType');
  assert(CONTROLLER_CLASSES.includes(controllerClass), `invalid controllerClass ${controllerClass}`);
  return {
    participantRef,
    participantType,
    displayName: displayName || participantRef,
    lineageRef,
    homeUniverseRef,
    partySlot: slotIndex,
    avatarExpression: {
      form: avatarForm || (participantType === 'HUMAN' ? FORM_DEFAULTS.human : FORM_DEFAULTS.companion),
      color
    },
    vesselRef: `vessel.first-grove.${participantRef.replace(/[^a-zA-Z0-9-]/g, '-')}`,
    controllerBinding: {
      controllerRef: `controller.${participantRef.replace(/[^a-zA-Z0-9-]/g, '-')}`,
      controllerClass,
      endpoint: controllerEndpoint,
      bindingGeneration: 1,
      lastIntentSequence: 0,
      lastIntentAt: null
    },
    body: {
      x: spawn.x,
      y: spawn.y,
      vx: 0,
      vy: 0,
      width: participantType === 'HUMAN' ? 38 : 34,
      height: participantType === 'HUMAN' ? 58 : 46,
      facing: 1,
      onGround: false,
      carriedBy: null,
      invulnerableUntil: 0
    },
    resources: {
      energy: maxEnergy,
      maxEnergy,
      reserveRequired: 12,
      restorationMethods: ['restoration.vextory.sunlight', 'restoration.vextory.hearth'],
      currentBand: 'AVAILABLE_MARGIN',
      returnMargin: maxEnergy,
      predictedReturnCost: 0
    },
    combat: {
      health: 100,
      maxHealth: 100,
      attackReadyAt: 0,
      dashReadyAt: 0,
      specialReadyAt: 0,
      comboReadyAt: 0,
      lastHitAt: 0
    },
    practice: {},
    flags: {
      resting: false,
      connected: controllerClass !== 'REMOTE_OLLAMA' && controllerClass !== 'REMOTE_DETERMINISTIC',
      remoteIntentStale: false
    }
  };
}

export function createParty({ setup, worldPackage }) {
  const maxEnergy = worldPackage.laws.resource.maxEnergy;
  const party = {
    schemaVersion: 'vexworld.party/v1',
    partyRef: setup.partyRef || 'party.vextory.local.001',
    capacity: PARTY_MAX_SIZE,
    humanParticipantRef: 'participant.victor',
    members: []
  };

  party.members.push(createParticipant({
    participantRef: setup.human?.participantRef || 'participant.victor',
    participantType: 'HUMAN',
    displayName: setup.human?.displayName || 'Victor',
    homeUniverseRef: setup.human?.homeUniverseRef || 'universe.vextreme.victor',
    avatarForm: setup.human?.avatarForm || 'WANDERER',
    color: setup.human?.color || '#ffcf66',
    controllerClass: 'LOCAL_HUMAN',
    slotIndex: 0,
    spawn: worldPackage.map.spawn.human,
    maxEnergy
  }));

  const companionSetups = (setup.companions || []).slice(0, PARTY_MAX_SIZE - 1);
  companionSetups.forEach((companion, index) => {
    const stableName = String(companion.displayName || ['Vex', 'Mira', 'Rowan'][index]).trim();
    const slug = stableName.toLowerCase().replace(/[^a-z0-9]+/g, '-') || `companion-${index + 1}`;
    party.members.push(createParticipant({
      participantRef: companion.participantRef || `participant.companion.${slug}`,
      participantType: 'AI_COMPANION',
      displayName: stableName,
      lineageRef: companion.lineageRef || `lineage.vex.${slug}`,
      homeUniverseRef: companion.homeUniverseRef || 'universe.vextreme.victor',
      avatarForm: companion.avatarForm || ['WISP', 'SPROUTLING', 'LITTLE_WARDEN'][index],
      color: companion.color || ['#94f1c8', '#f3a8d8', '#9fc6ff'][index],
      controllerClass: companion.controllerClass || 'LOCAL_DETERMINISTIC',
      controllerEndpoint: companion.controllerEndpoint || null,
      slotIndex: index + 1,
      spawn: worldPackage.map.spawn.companions[index],
      maxEnergy
    }));
  });

  validateParty(party);
  return party;
}

export function validateParty(party) {
  assert(party?.schemaVersion === 'vexworld.party/v1', 'invalid party schemaVersion');
  assert(Number.isInteger(party.capacity) && party.capacity === PARTY_MAX_SIZE, 'party capacity must be 4');
  assert(Array.isArray(party.members) && party.members.length >= 1 && party.members.length <= PARTY_MAX_SIZE, 'party size must be 1..4');
  const refs = new Set();
  let humanCount = 0;
  for (const member of party.members) {
    assert(!refs.has(member.participantRef), `duplicate participantRef ${member.participantRef}`);
    refs.add(member.participantRef);
    if (member.participantType === 'HUMAN') humanCount += 1;
    assert(member.vesselRef !== member.participantRef, 'vesselRef must remain distinct from participantRef');
    assert(member.controllerBinding.controllerRef !== member.participantRef, 'controllerRef must remain distinct from participantRef');
  }
  assert(humanCount === 1, 'prototype party requires exactly one human participant');
  return true;
}

export function getMember(party, participantRef) {
  return party.members.find((member) => member.participantRef === participantRef) || null;
}

export function getHuman(party) {
  return getMember(party, party.humanParticipantRef);
}

export function getCompanions(party) {
  return party.members.filter((member) => member.participantType === 'AI_COMPANION');
}

export function rebindController(member, { controllerClass, endpoint = null }) {
  assert(CONTROLLER_CLASSES.includes(controllerClass), `invalid controllerClass ${controllerClass}`);
  const priorIdentity = member.participantRef;
  const priorLineage = member.lineageRef;
  member.controllerBinding = {
    ...member.controllerBinding,
    controllerClass,
    endpoint,
    bindingGeneration: member.controllerBinding.bindingGeneration + 1,
    lastIntentSequence: 0,
    lastIntentAt: null
  };
  member.flags.connected = controllerClass.startsWith('LOCAL_');
  assert(member.participantRef === priorIdentity, 'controller rebind changed participant identity');
  assert(member.lineageRef === priorLineage, 'controller rebind changed lineage identity');
  return deepClone(member.controllerBinding);
}
