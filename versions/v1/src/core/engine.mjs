import { CURRENT_STATE_VERSION, FIXED_STEP_MS } from './constants.mjs';
import { deepClone } from './utils.mjs';
import { validateParty } from './party.mjs';
import { createInitialGame } from './runtime-state.mjs';
import { applyHumanInput, updateCompanions } from './participant-control.mjs';
import {
  expireTransientState,
  stepPartyPhysics,
  updateEnemies,
  updateFirstGroveProgress,
  updateQuestCompletion,
  updateResources,
  updateWeather,
  updateWorldWitness
} from './world-loop.mjs';
import { makeParticipantObservation } from './observation.mjs';

export { createInitialGame, makeParticipantObservation };

export function stepGame(
  state,
  input,
  worldPackage,
  { dtMs = FIXED_STEP_MS, externalIntents = {}, humanInputAbsent = false } = {}
) {
  if (!state || state.schemaVersion !== 'vexworld.game-state/v1') throw new TypeError('invalid game state');
  const dt = dtMs / 1000;
  const effectiveInput = input || {};
  if (state.flags.paused && !effectiveInput.pausePressed && !effectiveInput.statusPressed) return state;

  state.nowMs += dtMs;
  state.tick += 1;
  state.updatedAt = Date.now();
  // A headless realm host may advance the fictional world without fabricating
  // human controls. Skipping this call does not grant the host human identity;
  // it simply leaves the human participant untouched for this simulation tick.
  if (!humanInputAbsent) applyHumanInput(state, effectiveInput, worldPackage, dt);
  if (!state.flags.paused && !state.flags.statusOpen) {
    updateWeather(state, worldPackage);
    updateCompanions(state, externalIntents, worldPackage, dt);
    updateEnemies(state, worldPackage, dt);
    stepPartyPhysics(state, worldPackage, dt);
    updateFirstGroveProgress(state, worldPackage);
    updateResources(state, worldPackage, dt);
    updateWorldWitness(state, worldPackage);
    updateQuestCompletion(state);
  }
  expireTransientState(state, worldPackage);
  return state;
}

export function serializeGameState(state) {
  const copy = deepClone(state);
  copy.particles = [];
  copy.messages = copy.messages.slice(-12);
  copy.receipts = copy.receipts.slice(-120);
  return copy;
}

export function validateGameState(state) {
  if (state?.schemaVersion !== 'vexworld.game-state/v1') throw new TypeError('invalid game state schema');
  if (state.stateVersion !== CURRENT_STATE_VERSION) throw new TypeError(`unsupported stateVersion ${state.stateVersion}`);
  validateParty(state.party);
  if (state.realityContext.physicalEffectPossible !== false) throw new TypeError('prototype physicalEffectPossible must remain false');
  return true;
}

export function runHeadless(worldPackage, { steps = 600, setup = {}, inputFactory = () => ({}) } = {}) {
  const state = createInitialGame(worldPackage, setup);
  for (let step = 0; step < steps; step += 1) {
    stepGame(state, inputFactory(step, state), worldPackage, { dtMs: FIXED_STEP_MS });
  }
  validateGameState(state);
  return state;
}
