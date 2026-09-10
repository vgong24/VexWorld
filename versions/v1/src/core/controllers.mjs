import { ALLOWED_COMPANION_INTENTS } from './constants.mjs';
import { distance } from './utils.mjs';

export function validateCompanionIntent(intent) {
  if (!intent || typeof intent !== 'object') return { valid: false, reason: 'NOT_OBJECT' };
  if (!ALLOWED_COMPANION_INTENTS.includes(intent.intentType)) return { valid: false, reason: 'UNSUPPORTED_INTENT' };
  if (!Number.isInteger(intent.sequence) || intent.sequence < 1) return { valid: false, reason: 'INVALID_SEQUENCE' };
  if (!Number.isFinite(intent.formedAt)) return { valid: false, reason: 'INVALID_FORMED_AT' };
  if (!Number.isFinite(intent.expiresAt) || intent.expiresAt <= intent.formedAt) return { valid: false, reason: 'INVALID_EXPIRY' };
  return { valid: true };
}

export function chooseLocalCompanionIntent({ companion, human, enemies, world, nowMs, activeTechniqueSignal }) {
  const restoration = world.map.restorationPoints[0];
  if (companion.body.carriedBy) return { intentType: 'HOLD_POSITION', reason: 'BEING_ASSISTED' };
  if (companion.resources.currentBand === 'PROTECTIVE_RETURN_OR_HALT' || companion.resources.energy < 14) {
    return { intentType: 'RETURN_TO_RESTORATION', targetRef: restoration.entityRef, reason: 'RESOURCE_STEWARDSHIP' };
  }
  const nearbyEnemy = enemies
    .filter((enemy) => enemy.alive)
    .map((enemy) => ({ enemy, d: distance(companion.body, enemy.body) }))
    .sort((a, b) => a.d - b.d)[0];

  if (
    nearbyEnemy && nearbyEnemy.d < 165 && !activeTechniqueSignal &&
    companion.combat.comboReadyAt <= nowMs && human.combat.comboReadyAt <= nowMs &&
    companion.resources.energy >= 10 && human.resources.energy >= 10
  ) {
    return { intentType: 'SIGNAL_HIGH_LOW', targetRef: nearbyEnemy.enemy.entityRef, reason: 'COORDINATION_OPPORTUNITY' };
  }
  if (nearbyEnemy && nearbyEnemy.d < 250) {
    return { intentType: 'ATTACK_NEAREST', targetRef: nearbyEnemy.enemy.entityRef, reason: 'NEARBY_CHALLENGE' };
  }
  const separation = human.body.x - companion.body.x;
  if (Math.abs(separation) > 135) {
    return { intentType: 'FOLLOW_HUMAN', reason: 'PARTY_COHESION' };
  }
  return { intentType: 'HOLD_POSITION', reason: 'NO_HIGHER_PRIORITY' };
}

export function selectEffectiveIntent({ companion, remoteIntent, localContext, nowMs }) {
  const remoteClass = companion.controllerBinding.controllerClass.startsWith('REMOTE_');
  if (remoteClass && remoteIntent) {
    const validation = validateCompanionIntent(remoteIntent);
    if (
      validation.valid &&
      remoteIntent.sequence > companion.controllerBinding.lastIntentSequence &&
      remoteIntent.expiresAt >= nowMs
    ) {
      companion.controllerBinding.lastIntentSequence = remoteIntent.sequence;
      companion.controllerBinding.lastIntentAt = remoteIntent.formedAt;
      companion.flags.connected = true;
      companion.flags.remoteIntentStale = false;
      return remoteIntent;
    }
  }
  if (remoteClass) {
    const lastAt = companion.controllerBinding.lastIntentAt;
    companion.flags.remoteIntentStale = !lastAt || nowMs - lastAt > 5000;
    if (companion.resources.currentBand === 'PROTECTIVE_RETURN_OR_HALT') {
      return { intentType: 'RETURN_TO_RESTORATION', reason: 'REMOTE_STALE_PROTECTIVE_FALLBACK' };
    }
    return { intentType: 'FOLLOW_HUMAN', reason: 'REMOTE_STALE_SAFE_FALLBACK' };
  }
  return chooseLocalCompanionIntent(localContext);
}
