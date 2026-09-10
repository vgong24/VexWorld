import { promises as fs } from 'node:fs';
import { createInitialGame, makeParticipantObservation, stepGame } from '../core/engine.mjs';

const worldPackage = JSON.parse(await fs.readFile('generated/first-grove.world-package.json', 'utf8'));
const state = createInitialGame(worldPackage, {
  environment: 'GARDEN_MEADOW',
  companions: [
    { displayName: 'Vex', controllerClass: 'LOCAL_DETERMINISTIC' },
    { displayName: 'Mira', controllerClass: 'LOCAL_DETERMINISTIC' }
  ]
});

for (let step = 0; step < 2100; step += 1) {
  const input = {
    right: step < 1450,
    jumpPressed: step % 180 === 20,
    attackPressed: step % 48 === 0,
    comboPressed: Boolean(state.activeTechniqueSignal && Math.abs(state.nowMs - state.activeTechniqueSignal.idealResponseAt) < 20),
    weatherPressed: step === 600
  };
  stepGame(state, input, worldPackage);
}

const vex = state.party.members.find((member) => member.displayName === 'Vex');
console.log(JSON.stringify({
  schemaVersion: 'vexworld.headless-demo-receipt/v1',
  ticks: state.tick,
  simulationTimeMs: Number(state.nowMs.toFixed(2)),
  partySize: state.party.members.length,
  weather: state.weather.state,
  techniqueResults: state.techniqueHistory.map((entry) => entry.result),
  techniqueSeedState: state.quest.techniqueSeedState,
  twinHorizonTrial: state.quest.twinHorizonTrial,
  vexObservation: makeParticipantObservation(state, vex.participantRef, worldPackage),
  physicalEffectPossible: state.realityContext.physicalEffectPossible
}, null, 2));
