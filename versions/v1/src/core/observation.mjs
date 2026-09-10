import { distance } from './utils.mjs';
import { getHuman, getMember } from './party.mjs';

export function makeParticipantObservation(state, participantRef, worldPackage) {
  const member = getMember(state.party, participantRef);
  if (!member) throw new TypeError(`unknown participant ${participantRef}`);
  const human = getHuman(state.party);
  const nearbyEnemies = state.enemies
    .filter((enemy) => enemy.alive && distance(member.body, enemy.body) <= 440)
    .map((enemy) => ({
      entityRef: enemy.entityRef,
      kind: enemy.kind,
      relativeX: Number((enemy.body.x - member.body.x).toFixed(1)),
      relativeY: Number((enemy.body.y - member.body.y).toFixed(1)),
      healthRatio: Number((enemy.health / enemy.maxHealth).toFixed(2))
    }));
  const rest = worldPackage.map.restorationPoints[0];
  return {
    schemaVersion: 'vexworld.companion-observation/v1',
    observationRef: `observation.${participantRef}.${state.tick}`,
    sequence: state.tick,
    formedAt: Date.now(),
    simulationTimeMs: state.nowMs,
    worldRef: state.worldRef,
    realityClass: state.realityContext.realityClass,
    physicalEffectPossible: false,
    observerParticipantRef: participantRef,
    self: {
      x: Number(member.body.x.toFixed(1)),
      y: Number(member.body.y.toFixed(1)),
      energy: Number(member.resources.energy.toFixed(1)),
      resourceBand: member.resources.currentBand,
      returnMargin: member.resources.returnMargin,
      carriedBy: member.body.carriedBy,
      resting: member.flags.resting
    },
    human: {
      participantRef: human.participantRef,
      relativeX: Number((human.body.x - member.body.x).toFixed(1)),
      relativeY: Number((human.body.y - member.body.y).toFixed(1)),
      energy: Number(human.resources.energy.toFixed(1))
    },
    weather: state.weather.state,
    nearbyEnemies,
    restoration: {
      entityRef: rest.entityRef,
      relativeX: Number((rest.x - member.body.x).toFixed(1)),
      compatible: true
    },
    activeTeamSignal: state.activeTechniqueSignal,
    quest: {
      progressText: state.quest.progressText,
      twinHorizonTrial: state.quest.twinHorizonTrial,
      twinHorizonUnlocked: state.quest.twinHorizonUnlocked
    },
    affordances: [
      'FOLLOW_HUMAN',
      'EXPLORE_LEFT',
      'EXPLORE_RIGHT',
      'ATTACK_NEAREST',
      'SIGNAL_HIGH_LOW',
      'RETURN_TO_RESTORATION',
      'REST',
      'HOLD_POSITION'
    ],
    unknownRefs: []
  };
}
