import { getCompanions, getHuman } from './party.mjs';
import { selectEffectiveIntent } from './controllers.mjs';
import { moveMember, jumpMember } from './physics.mjs';
import { acceptHighLow, arcDash, basicAttack, nearestAliveEnemy, startHighLowSignal, tryTwinHorizon } from './combat.mjs';
import { interact, setWeather, toggleCarry } from './world-loop.mjs';

export function applyHumanInput(state, input, worldPackage, dt) {
  const human = getHuman(state.party);
  const direction = (input.right ? 1 : 0) - (input.left ? 1 : 0);
  if (!state.flags.paused && !state.flags.statusOpen) {
    human.flags.resting = false;
    moveMember(human, direction, worldPackage.laws.movement.humanSpeed, { ...worldPackage, weather: state.weather }, dt, true);
    if (input.jumpPressed) jumpMember(human, worldPackage);
    if (input.attackPressed) basicAttack(state, human, worldPackage, 'HUMAN');
    if (input.dashPressed) arcDash(state, human, worldPackage);
    if (input.comboPressed) acceptHighLow(state, worldPackage);
    if (input.specialPressed) tryTwinHorizon(state, worldPackage);
    if (input.interactPressed) interact(state, worldPackage);
    if (input.carryPressed) toggleCarry(state);
  }
  if (input.statusPressed) state.flags.statusOpen = !state.flags.statusOpen;
  if (input.pausePressed) state.flags.paused = !state.flags.paused;
  if (input.weatherPressed) {
    const next = state.weather.state === 'RAIN' ? 'CLEAR' : 'RAIN';
    setWeather(state, next);
  }
}

export function applyCompanionIntent(state, companion, intent, worldPackage, dt) {
  const human = getHuman(state.party);
  const world = { ...worldPackage, weather: state.weather };
  companion.flags.resting = false;
  switch (intent.intentType) {
    case 'FOLLOW_HUMAN': {
      const delta = human.body.x - companion.body.x;
      const direction = Math.abs(delta) > 65 ? Math.sign(delta) : 0;
      moveMember(companion, direction, worldPackage.laws.movement.companionSpeed, world, dt);
      if (human.body.y + 45 < companion.body.y && companion.body.onGround) jumpMember(companion, worldPackage);
      break;
    }
    case 'EXPLORE_LEFT':
      moveMember(companion, -1, worldPackage.laws.movement.companionSpeed * 0.8, world, dt);
      break;
    case 'EXPLORE_RIGHT':
      moveMember(companion, 1, worldPackage.laws.movement.companionSpeed * 0.8, world, dt);
      break;
    case 'RETURN_TO_RESTORATION': {
      const rest = worldPackage.map.restorationPoints[0];
      const delta = rest.x - companion.body.x;
      if (Math.abs(delta) <= rest.radius) {
        companion.flags.resting = true;
        companion.body.vx *= 0.7;
      } else {
        moveMember(companion, Math.sign(delta), worldPackage.laws.movement.companionSpeed * 0.92, world, dt);
      }
      break;
    }
    case 'ATTACK_NEAREST': {
      const target = intent.targetRef
        ? state.enemies.find((enemy) => enemy.entityRef === intent.targetRef && enemy.alive)
        : nearestAliveEnemy(state, companion.body, 320);
      if (!target) break;
      const delta = target.body.x - companion.body.x;
      if (Math.abs(delta) > 82) moveMember(companion, Math.sign(delta), worldPackage.laws.movement.companionSpeed, world, dt);
      else {
        companion.body.facing = Math.sign(delta) || companion.body.facing;
        basicAttack(state, companion, worldPackage, 'COMPANION');
      }
      break;
    }
    case 'SIGNAL_HIGH_LOW': {
      const target = state.enemies.find((enemy) => enemy.entityRef === intent.targetRef && enemy.alive) || nearestAliveEnemy(state, companion.body, 180);
      if (target) startHighLowSignal(state, companion, target, worldPackage);
      break;
    }
    case 'REST':
      companion.flags.resting = true;
      companion.body.vx *= 0.7;
      break;
    case 'HOLD_POSITION':
    default:
      companion.body.vx *= 0.82;
      break;
  }
}

export function updateCompanions(state, externalIntents, worldPackage, dt) {
  const human = getHuman(state.party);
  for (const companion of getCompanions(state.party)) {
    if (companion.body.carriedBy === human.participantRef) {
      companion.body.x = human.body.x - human.body.facing * 52;
      companion.body.y = human.body.y - 5;
      companion.flags.resting = true;
      continue;
    }
    const effectiveIntent = selectEffectiveIntent({
      companion,
      remoteIntent: externalIntents?.[companion.participantRef] || null,
      localContext: {
        companion,
        human,
        enemies: state.enemies,
        world: { ...worldPackage, weather: state.weather },
        nowMs: state.nowMs,
        activeTechniqueSignal: state.activeTechniqueSignal
      },
      nowMs: Date.now()
    });
    applyCompanionIntent(state, companion, effectiveIntent, worldPackage, dt);
    state.prototype.controllerObservations[companion.participantRef] = {
      intentType: effectiveIntent.intentType,
      reason: effectiveIntent.reason || null,
      at: state.nowMs
    };
  }
}
