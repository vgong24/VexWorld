import { CURRENT_STATE_VERSION } from './constants.mjs';
import { createRng, makeId } from './utils.mjs';
import { createParty, getCompanions, getHuman, validateParty } from './party.mjs';
import { updateResourceProjection } from './resource-state.mjs';
import { createBondResonanceProfile, resonanceKey } from './resonance.mjs';
import { createWorldWitnessState } from './world-witness.mjs';

export function createEnemy(source) {
  return {
    entityRef: source.entityRef,
    kind: source.kind,
    behaviorProfileRef: source.behaviorProfileRef || `behavior.first-grove.${String(source.kind || 'creature').toLowerCase()}.default`,
    spawn: { x: source.x, y: source.y },
    body: {
      x: source.x,
      y: source.y,
      vx: 0,
      vy: 0,
      width: source.kind === 'MOSSBACK' ? 70 : 46,
      height: source.kind === 'MOSSBACK' ? 56 : 38,
      facing: -1,
      onGround: false
    },
    health: source.health,
    maxHealth: source.health,
    alive: true,
    defeatedAt: null,
    attackReadyAt: 0,
    hopReadyAt: 0,
    flashUntil: 0
  };
}

function defaultSetup() {
  return {
    saveSlot: 1,
    environment: 'GARDEN_MEADOW',
    human: { displayName: 'Victor', avatarForm: 'WANDERER', color: '#ffcf66' },
    companions: [
      { displayName: 'Vex', avatarForm: 'WISP', color: '#94f1c8', controllerClass: 'LOCAL_DETERMINISTIC' }
    ]
  };
}

function initialFirstGroveJourney(worldPackage, environment) {
  const firstRegion = worldPackage.map.regions?.[0] || null;
  const home = worldPackage.map.restorationPoints?.find((point) => point.homeAnchor) || worldPackage.map.restorationPoints?.[0] || null;
  const origin = worldPackage.map.originConsequences?.[environment] || null;
  return {
    schemaVersion: 'vexworld.first-grove-journey/v1',
    currentRegionRef: firstRegion?.regionRef || null,
    visitedRegionRefs: firstRegion ? [firstRegion.regionRef] : [],
    discoveredRefs: [],
    acceptedOpportunityRefs: [],
    completedOpportunityRefs: [],
    visitedWitnessSiteRefs: [],
    homeAnchorRef: home?.entityRef || null,
    originContext: origin ? {
      environment,
      earlyTraversalCue: origin.earlyTraversalCue,
      earlyDiscoveryRef: origin.earlyDiscoveryRef,
      potentialCeilingEffect: origin.potentialCeilingEffect
    } : null,
    lastRegionChangedAt: 0
  };
}

export function createInitialGame(worldPackage, incomingSetup = {}) {
  const setup = { ...defaultSetup(), ...incomingSetup };
  setup.human = { ...defaultSetup().human, ...(incomingSetup.human || {}) };
  setup.companions = incomingSetup.companions ?? defaultSetup().companions;
  const party = createParty({ setup, worldPackage });
  const companions = getCompanions(party);
  const human = getHuman(party);
  const resonanceProfiles = Object.fromEntries(companions.map((companion) => {
    const refs = [human.participantRef, companion.participantRef];
    return [resonanceKey(refs), createBondResonanceProfile(refs)];
  }));
  const seed = Number(setup.seed ?? 0x245624);
  const rng = createRng(seed);
  const environment = worldPackage.expressions.environments[setup.environment]
    ? setup.environment
    : 'GARDEN_MEADOW';

  const state = {
    schemaVersion: 'vexworld.game-state/v1',
    stateVersion: CURRENT_STATE_VERSION,
    sessionRef: setup.sessionRef || `session.vextory.${Date.now().toString(36)}`,
    saveSlot: Number(setup.saveSlot || 1),
    createdAt: Date.now(),
    updatedAt: Date.now(),
    nowMs: 0,
    tick: 0,
    rngState: rng.state,
    worldRef: worldPackage.manifest.worldRef,
    realityContext: {
      schemaVersion: 'vexworld.reality-context-frame/v1',
      realityClass: worldPackage.manifest.realityClass,
      physicalEffectPossible: false,
      worldRef: worldPackage.manifest.worldRef,
      realmInstanceRef: `realm.first-grove.${Date.now().toString(36)}`,
      returnRouteRef: worldPackage.manifest.returnRouteRef,
      controlAuthorityRefs: ['authority.prototype.local-human-input', 'authority.prototype.world-runtime'],
      sensorAuthorityRefs: [],
      timeBasis: 'SIMULATION_TIME'
    },
    environment,
    weather: {
      state: 'CLEAR',
      priorState: null,
      transitionAt: worldPackage.laws.weather.prototypeTransitionSeconds * 1000,
      intensity: 0,
      changedAt: 0
    },
    party,
    enemies: worldPackage.map.enemies.map(createEnemy),
    firstGrove: initialFirstGroveJourney(worldPackage, environment),
    activeTechniqueSignal: null,
    techniqueHistory: [],
    resonanceProfiles,
    worldWitness: createWorldWitnessState(),
    quest: {
      techniqueSeedState: 'NONE',
      echoGateState: 'DORMANT',
      twinHorizonTrial: 'LOCKED',
      twinHorizonUnlocked: false,
      trialTargetRef: null,
      resonanceParticipantRefs: [],
      progressText: 'Explore First Grove with your companions.'
    },
    messages: [
      { id: 'message.welcome', at: 0, speaker: 'First Grove', text: 'Welcome. Learn where you are, then wander outward together.', kind: 'WORLD' }
    ],
    receipts: [],
    eventSequence: 1,
    particles: [],
    flags: {
      paused: false,
      statusOpen: false,
      onboardingComplete: true,
      hostLeaseHeld: false,
      readOnly: false,
      gameComplete: false
    },
    prototype: {
      packageFingerprint: worldPackage.integrityFingerprint,
      sourceState: worldPackage.manifest.sourceState,
      controllerObservations: {},
      lastCheckpointAt: 0
    }
  };

  validateParty(state.party);
  for (const member of state.party.members) updateResourceProjection(member, { ...worldPackage, weather: state.weather });
  return state;
}

export function addReceipt(state, type, payload = {}) {
  const receipt = {
    receiptRef: makeId(`receipt.${type.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`, state.eventSequence++),
    type,
    at: Number(state.nowMs.toFixed(2)),
    ...payload
  };
  state.receipts.push(receipt);
  if (state.receipts.length > 300) state.receipts.splice(0, state.receipts.length - 300);
  return receipt;
}

export function addMessage(state, speaker, text, kind = 'INFO', ttlMs = 7000) {
  const message = {
    id: makeId('message', state.eventSequence++),
    at: state.nowMs,
    expiresAt: state.nowMs + ttlMs,
    speaker,
    text,
    kind
  };
  state.messages.push(message);
  if (state.messages.length > 25) state.messages.splice(0, state.messages.length - 25);
  return message;
}

export function getPairResonance(state, participantA, participantB) {
  return state.resonanceProfiles[resonanceKey([participantA, participantB])] || null;
}
