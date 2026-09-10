import { clamp, distance } from './utils.mjs';
import { getCompanions, getHuman } from './party.mjs';
import { updateResourceProjection } from './resource-state.mjs';
import { recordResonanceEvent } from './resonance.mjs';
import { maybeFormTwinHorizonSeed } from './world-witness.mjs';
import { addMessage, addReceipt, createEnemy, getPairResonance } from './runtime-state.mjs';
import { stepPhysicsBody } from './physics.mjs';

export function updateWorldWitness(state, worldPackage) {
  if (state.quest.techniqueSeedState !== 'NONE') return;
  for (const profile of Object.values(state.resonanceProfiles)) {
    const seed = maybeFormTwinHorizonSeed({ state: state.worldWitness, resonanceProfile: profile, laws: worldPackage.laws });
    if (!seed) continue;
    state.quest.techniqueSeedState = seed.state;
    state.quest.echoGateState = 'REVEALED';
    state.quest.twinHorizonTrial = 'AVAILABLE';
    state.quest.resonanceParticipantRefs = [...profile.participantRefs];
    state.quest.progressText = 'The Echo Gate heard your rhythm. Find it in the eastern grove.';
    profile.opportunityRefs.push(`opportunity.resonance.twin-horizon-trial.${seed.techniqueSeedRef.split('.').pop()}`);
    addMessage(state, 'First Grove', 'A distant gate answers the rhythm you have been building together…', 'WORLD', 9000);
    addReceipt(state, 'TECHNIQUE_SEED_FORMED', {
      techniqueSeedRef: seed.techniqueSeedRef,
      participantRefs: [...profile.participantRefs],
      state: seed.state,
      effects: seed.effects
    });
    break;
  }
}

export function interact(state, worldPackage) {
  const human = getHuman(state.party);
  const rest = worldPackage.map.restorationPoints.find((point) => distance(human.body, point) <= point.radius);
  if (rest) {
    human.flags.resting = true;
    for (const companion of getCompanions(state.party)) {
      if (distance(human.body, companion.body) <= 180 || companion.body.carriedBy === human.participantRef) {
        companion.flags.resting = true;
        companion.body.carriedBy = null;
        const profile = getPairResonance(state, human.participantRef, companion.participantRef);
        if (profile) recordResonanceEvent(profile, {
          eventRef: `event.rest.${Math.floor(state.nowMs)}`,
          facetDeltas: { mutualAssistance: 0.5, repairAndRecovery: 0.5 }
        });
      }
    }
    addMessage(state, rest.title, 'You rest together. Energy returns without urgency.', 'REST', 3500);
    addReceipt(state, 'REST_STARTED', { restorationPointRef: rest.entityRef });
    return true;
  }
  const gate = worldPackage.map.portals.find((portal) => distance(human.body, portal) <= portal.radius);
  if (gate && state.quest.echoGateState === 'REVEALED') {
    if (state.quest.twinHorizonTrial === 'AVAILABLE') {
      state.quest.twinHorizonTrial = 'ACTIVE';
      state.quest.progressText = 'Earn an EXCELLENT or SYNCHRONIZED CRITICAL High/Low against the Echo Warden.';
      let warden = state.enemies.find((enemy) => enemy.entityRef === 'entity.first-grove.echo-warden');
      if (!warden) {
        warden = createEnemy({ entityRef: 'entity.first-grove.echo-warden', kind: 'MOSSBACK', x: gate.x - 220, y: 520, health: 140 });
        state.enemies.push(warden);
      } else {
        warden.alive = true;
        warden.health = warden.maxHealth;
        warden.body.x = gate.x - 220;
        warden.body.y = 520;
      }
      state.quest.trialTargetRef = warden.entityRef;
      addMessage(state, 'Echo Gate', 'Show me the rhythm you made—not the one you were assigned.', 'QUEST', 7000);
      addReceipt(state, 'QUEST_STARTED', { questRef: 'quest.first-grove.twin-horizon-trial' });
      return true;
    }
  }
  return false;
}

export function toggleCarry(state) {
  const human = getHuman(state.party);
  const candidate = getCompanions(state.party)
    .filter((companion) => distance(human.body, companion.body) <= 90)
    .sort((a, b) => a.resources.energy - b.resources.energy)[0];
  const currentlyCarried = getCompanions(state.party).find((companion) => companion.body.carriedBy === human.participantRef);
  if (currentlyCarried) {
    currentlyCarried.body.carriedBy = null;
    currentlyCarried.body.x = human.body.x - human.body.facing * 55;
    currentlyCarried.body.y = human.body.y;
    addMessage(state, human.displayName, `Sets ${currentlyCarried.displayName} down carefully.`, 'ASSIST', 2500);
    addReceipt(state, 'ASSISTED_RECOVERY_END', { companionRef: currentlyCarried.participantRef, mode: 'CART_OR_WHEELBARROW' });
    return true;
  }
  if (candidate && (candidate.resources.energy <= 18 || candidate.resources.currentBand === 'PROTECTIVE_RETURN_OR_HALT')) {
    candidate.body.carriedBy = human.participantRef;
    candidate.body.vx = 0;
    candidate.body.vy = 0;
    const profile = getPairResonance(state, human.participantRef, candidate.participantRef);
    if (profile) recordResonanceEvent(profile, {
      eventRef: `event.assist.${Math.floor(state.nowMs)}`,
      facetDeltas: { mutualAssistance: 1.2, repairAndRecovery: 0.8 }
    });
    addMessage(state, human.displayName, `Gives ${candidate.displayName} a ride back.`, 'ASSIST', 3500);
    addReceipt(state, 'ASSISTED_RECOVERY_START', { companionRef: candidate.participantRef, mode: 'CART_OR_WHEELBARROW' });
    return true;
  }
  return false;
}

export function updateEnemies(state, worldPackage, dt) {
  const activeMembers = state.party.members.filter((member) => !member.body.carriedBy);
  for (const enemy of state.enemies) {
    if (!enemy.alive) {
      if (enemy.entityRef !== 'entity.first-grove.echo-warden' && state.nowMs - enemy.defeatedAt >= worldPackage.laws.combat.enemyRespawnSeconds * 1000) {
        enemy.alive = true;
        enemy.health = enemy.maxHealth;
        enemy.body.x = enemy.spawn.x;
        enemy.body.y = enemy.spawn.y;
        enemy.body.vx = 0;
        enemy.body.vy = 0;
      }
      continue;
    }
    const closest = activeMembers
      .map((member) => ({ member, d: distance(enemy.body, member.body) }))
      .sort((a, b) => a.d - b.d)[0];
    if (!closest) continue;
    const aggressionRange = enemy.kind === 'MOSSBACK' ? 260 : 180;
    if (closest.d <= aggressionRange) {
      enemy.body.facing = Math.sign(closest.member.body.x - enemy.body.x) || enemy.body.facing;
      if (closest.d > 45) enemy.body.vx += enemy.body.facing * (enemy.kind === 'MOSSBACK' ? 80 : 115) * dt * 6;
      if (closest.d <= 48 && state.nowMs >= enemy.attackReadyAt && state.nowMs >= closest.member.body.invulnerableUntil) {
        enemy.attackReadyAt = state.nowMs + (enemy.kind === 'MOSSBACK' ? 1400 : 1100);
        closest.member.body.invulnerableUntil = state.nowMs + worldPackage.laws.combat.invulnerabilityMs;
        closest.member.resources.energy -= worldPackage.laws.combat.contactEnergyDamage * (enemy.kind === 'MOSSBACK' ? 1.4 : 1);
        closest.member.body.vx += -enemy.body.facing * 240;
        addReceipt(state, 'PARTICIPANT_CHALLENGED', { participantRef: closest.member.participantRef, enemyRef: enemy.entityRef });
      }
      if (enemy.kind !== 'MOSSBACK' && state.nowMs >= enemy.hopReadyAt && enemy.body.onGround) {
        enemy.body.vy = -420;
        enemy.hopReadyAt = state.nowMs + 1300 + (state.eventSequence % 4) * 240;
      }
    } else {
      enemy.body.vx *= 0.9;
    }
    enemy.body.vx = clamp(enemy.body.vx, -140, 140);
    stepPhysicsBody(enemy.body, worldPackage, dt);
  }
}

export function setWeather(state, nextState) {
  if (state.weather.state === nextState) return;
  state.weather.priorState = state.weather.state;
  state.weather.state = nextState;
  state.weather.changedAt = state.nowMs;
  state.weather.intensity = nextState === 'CLEAR' ? 0 : 1;
  addMessage(state, 'First Grove', nextState === 'RAIN' ? 'Rain begins. Paths grow slower; restoration distance matters more.' : `Weather shifts to ${nextState.toLowerCase().replace('_', ' ')}.`, 'WEATHER', 6500);
  addReceipt(state, 'WEATHER_CHANGED', { prior: state.weather.priorState, current: nextState });
}

export function updateWeather(state, worldPackage) {
  if (state.nowMs >= state.weather.transitionAt && state.weather.state === 'CLEAR') {
    const preferred = worldPackage.expressions.environments[state.environment]?.weather || 'RAIN';
    setWeather(state, preferred);
  }
}

export function updateResources(state, worldPackage, dt) {
  const world = { ...worldPackage, weather: state.weather };
  for (const member of state.party.members) {
    const rest = worldPackage.map.restorationPoints.find((point) => distance(member.body, point) <= point.radius);
    if (member.flags.resting && rest) {
      member.resources.energy += worldPackage.laws.resource.restorationPerSecond * dt;
      member.body.vx *= 0.7;
    } else if (Math.abs(member.body.vx) < 8 && member.body.onGround) {
      member.resources.energy += worldPackage.laws.resource.idleRegenPerSecond * dt;
    }
    member.resources.energy = clamp(member.resources.energy, 0, member.resources.maxEnergy);
    updateResourceProjection(member, world);
  }
}

export function updateQuestCompletion(state) {
  if (state.quest.twinHorizonTrial !== 'ACTIVE') return;
  const recent = state.techniqueHistory[state.techniqueHistory.length - 1];
  if (!recent || recent.targetRef !== state.quest.trialTargetRef) return;
  if (!['EXCELLENT_SYNC', 'SYNCHRONIZED_CRITICAL'].includes(recent.result)) return;
  state.quest.twinHorizonTrial = 'COMPLETE';
  state.quest.twinHorizonUnlocked = true;
  state.quest.progressText = 'Twin Horizon learned. Press Q when you and your first companion are nearby.';
  const seed = state.worldWitness.candidateSeeds.find((candidate) =>
    [...(candidate.originParticipantRefs || [])].sort().join('::') === [...state.quest.resonanceParticipantRefs].sort().join('::')
  );
  if (seed) {
    seed.state = 'LEARNED_VARIANT';
    seed.effects.learnedAbilityGranted = true;
  }
  addMessage(state, 'Echo Gate', 'The technique is yours because you demonstrated it together.', 'QUEST', 8000);
  addReceipt(state, 'ABILITY_LEARNED', { abilityRef: 'ability.vexworld.twin-horizon', sourceTechniqueSeedRef: seed?.techniqueSeedRef || null });
}

export function expireTransientState(state, worldPackage) {
  state.messages = state.messages.filter((message) => message.expiresAt == null || message.expiresAt > state.nowMs || message.id === 'message.welcome');
  state.particles = state.particles.filter((particle) => particle.expiresAt > state.nowMs);
  if (state.activeTechniqueSignal && state.nowMs > state.activeTechniqueSignal.expiresAt) {
    addReceipt(state, 'TEAM_TECHNIQUE_ABORTED', { ...state.activeTechniqueSignal, reason: 'NO_RESPONSE' });
    state.activeTechniqueSignal = null;
  }
}

export function stepPartyPhysics(state, worldPackage, dt) {
  for (const member of state.party.members) stepPhysicsBody(member.body, worldPackage, dt);
}
