import { clamp, distance } from './utils.mjs';
import { getCompanions, getHuman } from './party.mjs';
import { updateResourceProjection } from './resource-state.mjs';
import { recordPractice } from './practice.mjs';
import { recordResonanceEvent } from './resonance.mjs';
import { maybeFormTwinHorizonSeed } from './world-witness.mjs';
import { addMessage, addReceipt, createEnemy, getPairResonance } from './runtime-state.mjs';
import { stepPhysicsBody } from './physics.mjs';

function ensureFirstGroveJourney(state, worldPackage) {
  if (state.firstGrove) return state.firstGrove;
  const firstRegion = worldPackage.map.regions?.[0] || null;
  const home = worldPackage.map.restorationPoints?.find((point) => point.homeAnchor) || worldPackage.map.restorationPoints?.[0] || null;
  const origin = worldPackage.map.originConsequences?.[state.environment] || null;
  state.firstGrove = {
    schemaVersion: 'vexworld.first-grove-journey/v1',
    currentRegionRef: firstRegion?.regionRef || null,
    visitedRegionRefs: firstRegion ? [firstRegion.regionRef] : [],
    discoveredRefs: [],
    acceptedOpportunityRefs: [],
    completedOpportunityRefs: [],
    visitedWitnessSiteRefs: [],
    homeAnchorRef: home?.entityRef || null,
    originContext: origin ? {
      environment: state.environment,
      earlyTraversalCue: origin.earlyTraversalCue,
      earlyDiscoveryRef: origin.earlyDiscoveryRef,
      potentialCeilingEffect: origin.potentialCeilingEffect
    } : null,
    lastRegionChangedAt: state.nowMs
  };
  return state.firstGrove;
}

export function updateFirstGroveProgress(state, worldPackage) {
  const journey = ensureFirstGroveJourney(state, worldPackage);
  const human = getHuman(state.party);
  const region = worldPackage.map.regions?.find((entry) => human.body.x >= entry.xMin && human.body.x <= entry.xMax) || null;
  if (!region || region.regionRef === journey.currentRegionRef) return journey;

  journey.currentRegionRef = region.regionRef;
  journey.lastRegionChangedAt = state.nowMs;
  const firstVisit = !journey.visitedRegionRefs.includes(region.regionRef);
  if (firstVisit) journey.visitedRegionRefs.push(region.regionRef);

  addMessage(
    state,
    region.title || 'First Grove',
    firstVisit ? `You enter ${region.title}. The way home remains behind you.` : `You return to ${region.title}.`,
    'WORLD',
    4200
  );
  addReceipt(state, 'REGION_ENTERED', {
    regionRef: region.regionRef,
    firstVisit,
    homeAnchorRef: journey.homeAnchorRef
  });
  return journey;
}

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
  const journey = ensureFirstGroveJourney(state, worldPackage);
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
    addMessage(state, rest.title, rest.homeAnchor ? 'You are home for now. You rest together; the outward route will still be there.' : 'You shelter together. Energy returns without urgency.', 'REST', 4000);
    addReceipt(state, 'REST_STARTED', { restorationPointRef: rest.entityRef, homeAnchor: Boolean(rest.homeAnchor) });
    return true;
  }

  const resident = worldPackage.map.residents?.find((entry) => distance(human.body, entry) <= 95);
  if (resident) {
    const opportunity = worldPackage.map.opportunities?.find((entry) => entry.offeredByRef === resident.residentRef) || null;
    if (!opportunity) {
      addMessage(state, resident.displayName || 'Resident', 'The grove is quiet here.', 'RESIDENT', 3500);
      return true;
    }
    if (!journey.acceptedOpportunityRefs.includes(opportunity.opportunityRef)) {
      journey.acceptedOpportunityRefs.push(opportunity.opportunityRef);
      const practice = recordPractice(human, opportunity.practiceRef, {
        success: true,
        difficulty: 0.25,
        novel: true,
        targetRef: resident.residentRef,
        contextRef: journey.currentRegionRef || 'region.first-grove.unknown'
      });
      addMessage(state, resident.displayName, `You choose to ${opportunity.title.toLowerCase()}. This is practice, not a class or permanent role.`, 'OPPORTUNITY', 6500);
      addReceipt(state, 'VOLUNTARY_OPPORTUNITY_ACCEPTED', {
        opportunityRef: opportunity.opportunityRef,
        residentRef: resident.residentRef,
        practiceRef: opportunity.practiceRef,
        practiceEvidence: practice.evidence,
        completionAuthority: opportunity.completionAuthority
      });
    } else {
      addMessage(state, resident.displayName, 'There is no rush. Walk, notice, return, or do something else.', 'OPPORTUNITY', 4500);
    }
    return true;
  }

  const discovery = worldPackage.map.discoveries?.find((entry) => distance(human.body, entry) <= 100);
  if (discovery) {
    const firstDiscovery = !journey.discoveredRefs.includes(discovery.discoveryRef);
    if (firstDiscovery) journey.discoveredRefs.push(discovery.discoveryRef);
    const label = discovery.discoveryRef.split('.').pop().replaceAll('-', ' ');
    addMessage(state, 'First Grove', firstDiscovery ? `You notice ${label}. You may keep going or turn home.` : `${label} is still here. Nothing requires you to continue.`, 'DISCOVERY', 5200);
    addReceipt(state, firstDiscovery ? 'DISCOVERY_FOUND' : 'DISCOVERY_REVISITED', {
      discoveryRef: discovery.discoveryRef,
      optional: discovery.optional,
      returnPromptRef: discovery.returnPromptRef
    });
    return true;
  }

  const witnessSite = worldPackage.map.worldWitnessSites?.find((entry) => distance(human.body, entry) <= 120);
  if (witnessSite) {
    const firstVisit = !journey.visitedWitnessSiteRefs.includes(witnessSite.siteRef);
    if (firstVisit) journey.visitedWitnessSiteRefs.push(witnessSite.siteRef);
    const candidateCount = state.worldWitness?.candidateSeeds?.length || 0;
    addMessage(
      state,
      'Echo Overlook',
      candidateCount > 0
        ? 'The overlook can reflect a pattern you already demonstrated. It does not decide what is true about you.'
        : 'The overlook notices only bounded play that happens here. It grants nothing by observation alone.',
      'WORLD_WITNESS',
      6500
    );
    addReceipt(state, 'WORLD_WITNESS_SITE_VISITED', {
      siteRef: witnessSite.siteRef,
      firstVisit,
      observedFacetRefs: [...witnessSite.observesOnly],
      candidateSeedCount: candidateCount,
      automaticFactPromotion: witnessSite.automaticFactPromotion,
      automaticAbilityGrant: witnessSite.automaticAbilityGrant,
      relationshipWorthScoring: witnessSite.relationshipWorthScoring
    });
    return true;
  }

  const gate = worldPackage.map.portals.find((portal) => distance(human.body, portal) <= portal.radius);
  if (gate && state.quest.echoGateState === 'REVEALED') {
    if (state.quest.twinHorizonTrial === 'AVAILABLE') {
      state.quest.twinHorizonTrial = 'ACTIVE';
      state.quest.progressText = 'Earn an EXCELLENT or SYNCHRONIZED CRITICAL High/Low against the Echo Warden.';
      let warden = state.enemies.find((enemy) => enemy.entityRef === 'entity.first-grove.echo-warden');
      if (!warden) {
        warden = createEnemy({ entityRef: 'entity.first-grove.echo-warden', kind: 'MOSSBACK', behaviorProfileRef: 'behavior.first-grove.mossback-echo-warden', x: gate.x - 220, y: 520, health: 140 });
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

function behaviorTuning(enemy) {
  const profile = enemy.behaviorProfileRef || '';
  if (profile.includes('curious')) return { aggressionRange: 145, pursuitSpeed: 72, hopInterval: 1900, patrolSpeed: 24, patrolRate: 0.65 };
  if (profile.includes('hop-guard')) return { aggressionRange: 220, pursuitSpeed: 112, hopInterval: 980, patrolSpeed: 18, patrolRate: 0.8 };
  if (profile.includes('high-perch')) return { aggressionRange: 175, pursuitSpeed: 64, hopInterval: 820, patrolSpeed: 0, patrolRate: 0.5 };
  if (profile.includes('orchard-loop')) return { aggressionRange: 195, pursuitSpeed: 88, hopInterval: 1450, patrolSpeed: 42, patrolRate: 0.9 };
  if (profile.includes('bridge-guard')) return { aggressionRange: 340, pursuitSpeed: 62, hopInterval: 2200, patrolSpeed: 12, patrolRate: 0.45 };
  if (profile.includes('shelter-roamer')) return { aggressionRange: 260, pursuitSpeed: 78, hopInterval: 2100, patrolSpeed: 28, patrolRate: 0.55 };
  if (profile.includes('overlook-scout')) return { aggressionRange: 245, pursuitSpeed: 122, hopInterval: 760, patrolSpeed: 35, patrolRate: 1.0 };
  if (profile.includes('echo-warden')) return { aggressionRange: 360, pursuitSpeed: 72, hopInterval: 1900, patrolSpeed: 0, patrolRate: 0.4 };
  return enemy.kind === 'MOSSBACK'
    ? { aggressionRange: 260, pursuitSpeed: 80, hopInterval: 1800, patrolSpeed: 14, patrolRate: 0.5 }
    : { aggressionRange: 180, pursuitSpeed: 115, hopInterval: 1300, patrolSpeed: 18, patrolRate: 0.7 };
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
    const tuning = behaviorTuning(enemy);
    const closest = activeMembers
      .map((member) => ({ member, d: distance(enemy.body, member.body) }))
      .sort((a, b) => a.d - b.d)[0];
    if (!closest) continue;
    if (closest.d <= tuning.aggressionRange) {
      enemy.body.facing = Math.sign(closest.member.body.x - enemy.body.x) || enemy.body.facing;
      if (closest.d > 45) enemy.body.vx += enemy.body.facing * tuning.pursuitSpeed * dt * 6;
      if (closest.d <= 48 && state.nowMs >= enemy.attackReadyAt && state.nowMs >= closest.member.body.invulnerableUntil) {
        enemy.attackReadyAt = state.nowMs + (enemy.kind === 'MOSSBACK' ? 1400 : 1100);
        closest.member.body.invulnerableUntil = state.nowMs + worldPackage.laws.combat.invulnerabilityMs;
        closest.member.resources.energy -= worldPackage.laws.combat.contactEnergyDamage * (enemy.kind === 'MOSSBACK' ? 1.4 : 1);
        closest.member.body.vx += -enemy.body.facing * 240;
        addReceipt(state, 'PARTICIPANT_CHALLENGED', { participantRef: closest.member.participantRef, enemyRef: enemy.entityRef, behaviorProfileRef: enemy.behaviorProfileRef });
      }
      if (enemy.kind !== 'MOSSBACK' && state.nowMs >= enemy.hopReadyAt && enemy.body.onGround) {
        enemy.body.vy = -420;
        enemy.hopReadyAt = state.nowMs + tuning.hopInterval + (state.eventSequence % 4) * 120;
      }
    } else if (tuning.patrolSpeed > 0) {
      const phase = Math.sin((state.nowMs / 1000) * tuning.patrolRate + enemy.spawn.x * 0.01);
      const patrolDirection = phase >= 0 ? 1 : -1;
      enemy.body.facing = patrolDirection;
      enemy.body.vx = moveToward(enemy.body.vx, patrolDirection * tuning.patrolSpeed, tuning.patrolSpeed * 3 * dt);
    } else {
      enemy.body.vx *= 0.86;
    }
    enemy.body.vx = clamp(enemy.body.vx, -140, 140);
    stepPhysicsBody(enemy.body, worldPackage, dt);
  }
}

function moveToward(current, target, delta) {
  if (current < target) return Math.min(current + delta, target);
  if (current > target) return Math.max(current - delta, target);
  return target;
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
