import { distance } from './utils.mjs';
import { getCompanions, getHuman, getMember } from './party.mjs';
import { createTechniqueSignal, resolveTechniqueResponse, techniqueDamage } from './team-technique.mjs';
import { recordPractice } from './practice.mjs';
import { recordResonanceEvent } from './resonance.mjs';
import { witnessEligibleEvent } from './world-witness.mjs';
import { addMessage, addReceipt, getPairResonance } from './runtime-state.mjs';

export function nearestAliveEnemy(state, fromBody, maxDistance = Number.POSITIVE_INFINITY) {
  return state.enemies
    .filter((enemy) => enemy.alive)
    .map((enemy) => ({ enemy, d: distance(fromBody, enemy.body) }))
    .filter(({ d }) => d <= maxDistance)
    .sort((a, b) => a.d - b.d)[0]?.enemy || null;
}

export function damageEnemy(state, enemy, damage, sourceRef, kind = 'BASIC') {
  if (!enemy?.alive || damage <= 0) return null;
  enemy.health = Math.max(0, enemy.health - damage);
  enemy.flashUntil = state.nowMs + 140;
  const receipt = addReceipt(state, 'DAMAGE', {
    sourceRef,
    targetRef: enemy.entityRef,
    damage,
    damageKind: kind,
    remainingHealth: enemy.health
  });
  state.particles.push({ kind: 'HIT', x: enemy.body.x, y: enemy.body.y - 10, text: String(damage), expiresAt: state.nowMs + 650 });
  if (enemy.health <= 0) {
    enemy.alive = false;
    enemy.defeatedAt = state.nowMs;
    enemy.body.vx = 0;
    addMessage(state, 'First Grove', `${enemy.kind === 'MOSSBACK' ? 'Mossback' : 'Spriglet'} settles into harmless leaves.`, 'WORLD', 3500);
    addReceipt(state, 'ENEMY_DEFEATED', { targetRef: enemy.entityRef, sourceRef });
  }
  return receipt;
}

export function basicAttack(state, member, world, sourceKind = 'HUMAN') {
  if (state.nowMs < member.combat.attackReadyAt || member.resources.energy < world.laws.resource.attackCost) return false;
  member.combat.attackReadyAt = state.nowMs + 360;
  member.resources.energy -= world.laws.resource.attackCost;
  const target = nearestAliveEnemy(state, member.body, 92);
  const eventContext = `${state.environment}:${state.weather.state}`;
  if (target) {
    const facingValid = Math.sign(target.body.x - member.body.x) === member.body.facing || Math.abs(target.body.x - member.body.x) < 35;
    if (facingValid) {
      damageEnemy(state, target, sourceKind === 'HUMAN' ? 12 : 9, member.participantRef, 'PULSE_STRIKE');
      recordPractice(member, 'practice.vexworld.blade', {
        success: true,
        difficulty: target.kind === 'MOSSBACK' ? 1.2 : 0.5,
        targetRef: target.entityRef,
        contextRef: eventContext,
        novel: member.body.onGround === false
      });
      return true;
    }
  }
  recordPractice(member, 'practice.vexworld.blade', { success: false, contextRef: eventContext });
  return true;
}

export function arcDash(state, member, world) {
  if (state.nowMs < member.combat.dashReadyAt || member.resources.energy < world.laws.resource.dashCost || member.body.carriedBy) return false;
  member.combat.dashReadyAt = state.nowMs + 900;
  member.resources.energy -= world.laws.resource.dashCost;
  member.body.vx = member.body.facing * 700;
  if (!member.body.onGround) member.body.vy -= 80;
  recordPractice(member, 'practice.vexworld.arc-mobility', {
    success: true,
    difficulty: member.body.onGround ? 0.2 : 0.7,
    contextRef: `${state.environment}:${state.weather.state}`,
    novel: !member.body.onGround
  });
  state.particles.push({ kind: 'DASH', x: member.body.x, y: member.body.y, expiresAt: state.nowMs + 300, color: member.avatarExpression.color });
  return true;
}

export function startHighLowSignal(state, initiator, target, worldPackage) {
  if (state.activeTechniqueSignal || !target?.alive) return false;
  const human = getHuman(state.party);
  if (initiator.participantRef === human.participantRef) return false;
  const technique = worldPackage.catalogs.teamTechniques.techniques.find((candidate) => candidate.teamTechniqueRef === 'technique.vexworld.high-low');
  if (!technique) return false;
  state.activeTechniqueSignal = createTechniqueSignal({
    technique,
    initiatorRef: initiator.participantRef,
    responderRef: human.participantRef,
    targetRef: target.entityRef,
    nowMs: state.nowMs
  });
  initiator.combat.comboReadyAt = state.nowMs + 2600;
  human.combat.comboReadyAt = state.nowMs + 2600;
  addMessage(state, initiator.displayName, 'Go low — I’m taking high!', 'SIGNAL', technique.timing.expiresMs);
  addReceipt(state, 'TEAM_TECHNIQUE_SIGNAL', { ...state.activeTechniqueSignal });
  return true;
}

export function acceptHighLow(state, worldPackage) {
  const signal = state.activeTechniqueSignal;
  if (!signal || signal.state !== 'SIGNALLED') return false;
  const technique = worldPackage.catalogs.teamTechniques.techniques.find((candidate) => candidate.teamTechniqueRef === signal.techniqueRef);
  const human = getMember(state.party, signal.responderRef);
  const initiator = getMember(state.party, signal.initiatorRef);
  const target = state.enemies.find((enemy) => enemy.entityRef === signal.targetRef);
  if (!technique || !human || !initiator || !target?.alive) {
    state.activeTechniqueSignal = null;
    return false;
  }
  if (human.resources.energy < technique.energyCostPerParticipant || initiator.resources.energy < technique.energyCostPerParticipant) {
    addMessage(state, 'First Grove', 'The pair lacks enough energy to commit safely.', 'RESOURCE');
    state.activeTechniqueSignal = null;
    return false;
  }
  const resolution = resolveTechniqueResponse({ signal, responseAt: state.nowMs, technique });
  human.resources.energy -= technique.energyCostPerParticipant;
  initiator.resources.energy -= technique.energyCostPerParticipant;
  human.body.facing = Math.sign(target.body.x - human.body.x) || human.body.facing;
  initiator.body.facing = Math.sign(target.body.x - initiator.body.x) || initiator.body.facing;
  initiator.body.vy = -620;
  initiator.body.vx = initiator.body.facing * 120;
  damageEnemy(state, target, techniqueDamage(resolution.result), `${human.participantRef}+${initiator.participantRef}`, resolution.result);
  const receipt = addReceipt(state, 'TEAM_TECHNIQUE_RESOLVED', {
    techniqueRef: technique.teamTechniqueRef,
    initiatorRef: initiator.participantRef,
    responderRef: human.participantRef,
    targetRef: target.entityRef,
    result: resolution.result,
    timingDeltaMs: Number(resolution.deltaMs.toFixed(2))
  });
  state.techniqueHistory.push(receipt);
  const strong = ['GOOD_SYNC', 'EXCELLENT_SYNC', 'SYNCHRONIZED_CRITICAL'].includes(resolution.result);
  recordPractice(human, 'practice.vexworld.team-coordination', {
    success: resolution.result !== 'BROKEN_OR_ABORTED',
    difficulty: resolution.result === 'SYNCHRONIZED_CRITICAL' ? 1.5 : 0.8,
    targetRef: target.entityRef,
    contextRef: `${state.environment}:${state.weather.state}`,
    combination: true,
    novel: strong
  });
  recordPractice(initiator, 'practice.vexworld.team-coordination', {
    success: resolution.result !== 'BROKEN_OR_ABORTED',
    difficulty: resolution.result === 'SYNCHRONIZED_CRITICAL' ? 1.5 : 0.8,
    targetRef: target.entityRef,
    contextRef: `${state.environment}:${state.weather.state}`,
    combination: true,
    novel: strong
  });
  if (strong) {
    const pairResonance = getPairResonance(state, human.participantRef, initiator.participantRef);
    if (pairResonance) recordResonanceEvent(pairResonance, {
      eventRef: receipt.receiptRef,
      facetDeltas: {
        coordination: resolution.result === 'SYNCHRONIZED_CRITICAL' ? 2.2 : 1.2,
        sharedPractice: 1,
        playAndExploration: 0.35
      }
    });
    witnessEligibleEvent(state.worldWitness, {
      eventRef: receipt.receiptRef,
      eligible: true,
      patternClass: 'HIGH_LOW_COORDINATION',
      result: resolution.result,
      targetRef: target.entityRef,
      environmentRef: state.environment,
      participantRefs: [human.participantRef, initiator.participantRef]
    });
  }
  addMessage(state, 'Team', resolution.result.replaceAll('_', ' '), 'COMBO', 3000);
  state.particles.push({ kind: 'COMBO', x: target.body.x, y: target.body.y - 80, text: resolution.result.replaceAll('_', ' '), expiresAt: state.nowMs + 1100 });
  state.activeTechniqueSignal = null;
  return true;
}

export function tryTwinHorizon(state, worldPackage) {
  if (!state.quest.twinHorizonUnlocked) {
    addMessage(state, 'First Grove', 'That resonance has not stabilized yet.', 'WORLD', 2500);
    return false;
  }
  const human = getHuman(state.party);
  const companionRef = state.quest.resonanceParticipantRefs.find((ref) => ref !== human.participantRef);
  const companion = companionRef ? getMember(state.party, companionRef) : getCompanions(state.party)[0];
  if (!companion || state.nowMs < human.combat.specialReadyAt || state.nowMs < companion.combat.specialReadyAt) return false;
  const cost = worldPackage.catalogs.abilities.abilities.find((ability) => ability.abilityRef === 'ability.vexworld.twin-horizon')?.energyCostPerParticipant ?? 14;
  if (human.resources.energy < cost || companion.resources.energy < cost || distance(human.body, companion.body) > 260) {
    addMessage(state, 'Team', 'Twin Horizon needs both partners nearby and ready.', 'RESOURCE', 2500);
    return false;
  }
  human.resources.energy -= cost;
  companion.resources.energy -= cost;
  human.combat.specialReadyAt = state.nowMs + 6500;
  companion.combat.specialReadyAt = state.nowMs + 6500;
  const midpoint = { x: (human.body.x + companion.body.x) / 2, y: (human.body.y + companion.body.y) / 2 };
  for (const enemy of state.enemies) {
    if (enemy.alive && distance(midpoint, enemy.body) <= 260) {
      damageEnemy(state, enemy, 38, `${human.participantRef}+${companion.participantRef}`, 'TWIN_HORIZON');
    }
  }
  state.particles.push({ kind: 'HORIZON', x: midpoint.x, y: midpoint.y, expiresAt: state.nowMs + 900 });
  addMessage(state, 'Team', 'Twin Horizon!', 'COMBO', 3000);
  addReceipt(state, 'ABILITY_USED', { abilityRef: 'ability.vexworld.twin-horizon', participantRefs: [human.participantRef, companion.participantRef] });
  return true;
}
