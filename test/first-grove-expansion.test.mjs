import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { compileFirstGrove } from '../versions/v1/src/compiler/world-compiler.mjs';
import { createInitialGame } from '../versions/v1/src/core/runtime-state.mjs';
import { getHuman } from '../versions/v1/src/core/party.mjs';
import { interact, updateEnemies, updateFirstGroveProgress } from '../versions/v1/src/core/world-loop.mjs';

const root = fileURLToPath(new URL('../versions/v1/', import.meta.url));

test('First Grove source forms a five-region outward-and-return adventure rather than a flat demonstration field', async () => {
  const world = await compileFirstGrove({ root });
  assert.deepEqual(world.map.regions.map((region) => region.regionRef), [
    'region.first-grove.arrival-hearth',
    'region.first-grove.sunbloom-rise',
    'region.first-grove.hushed-orchard',
    'region.first-grove.mossbridge',
    'region.first-grove.echo-overlook'
  ]);
  assert.equal(world.map.restorationPoints.find((point) => point.homeAnchor)?.entityRef, 'entity.first-grove.sunbloom-hearth');
  assert.ok(new Set(world.map.platforms.map((platform) => platform.routeLayer).filter(Boolean)).size >= 4);
});

test('origins change early context without becoming potential ceilings', async () => {
  const world = await compileFirstGrove({ root });
  const entries = Object.entries(world.map.originConsequences);
  assert.equal(entries.length, 6);
  for (const [, consequence] of entries) {
    assert.equal(consequence.potentialCeilingEffect, 'NONE');
    assert.ok(consequence.earlyTraversalCue);
    assert.ok(consequence.earlyDiscoveryRef);
  }
  assert.equal(world.expressions.arrivalRitual.originCreatesPotentialCeiling, false);
  assert.equal(world.expressions.arrivalRitual.companionFirstFormIsMutable, true);
});

test('resident opportunity is voluntary practice rather than identity or license', async () => {
  const world = await compileFirstGrove({ root });
  const resident = world.map.residents.find((entry) => entry.residentRef === 'resident.first-grove.ilex');
  const opportunity = world.map.opportunities.find((entry) => entry.opportunityRef === 'opportunity.first-grove.orchard-inspection');
  assert.equal(resident.roleIsIdentity, false);
  assert.equal(opportunity.practiceRef, 'practice.vexworld.orchard-inspection');
  assert.equal(opportunity.voluntary, true);
  assert.equal(opportunity.declinePenalty, 'NONE');
  assert.equal(opportunity.completionAuthority, 'SCENARIO_EVIDENCE_ONLY');
});

test('cooperative encounter and World Witness remain invitations rather than hidden relationship scoring', async () => {
  const world = await compileFirstGrove({ root });
  const encounter = world.map.encounters[0];
  const site = world.map.worldWitnessSites[0];
  assert.equal(encounter.teamTechniqueRef, 'technique.vexworld.high-low');
  assert.equal(encounter.signalIsInvitation, true);
  assert.equal(encounter.forcedExecution, false);
  assert.equal(encounter.relationshipWorthEffect, 'NONE');
  assert.equal(site.automaticFactPromotion, false);
  assert.equal(site.automaticAbilityGrant, false);
  assert.equal(site.relationshipWorthScoring, false);
  assert.equal(site.offerPolicy, 'OPTIONAL_DISCOVERY_ONLY');
});

test('creature placement exposes several distinct behavior profiles and optional discoveries', async () => {
  const world = await compileFirstGrove({ root });
  const behaviors = new Set(world.map.enemies.map((enemy) => enemy.behaviorProfileRef));
  assert.ok(behaviors.size >= 5);
  assert.ok(world.map.discoveries.length >= 2);
  assert.ok(world.map.discoveries.every((discovery) => discovery.optional === true));
  assert.equal(world.manifest.partyCapacity, 4);
});

test('First Grove runtime consumes region resident discovery and Witness source through explicit interaction', async () => {
  const world = await compileFirstGrove({ root });
  const state = createInitialGame(world, { environment: 'GARDEN_MEADOW' });
  const human = getHuman(state.party);

  assert.equal(state.firstGrove.homeAnchorRef, 'entity.first-grove.sunbloom-hearth');
  assert.equal(state.firstGrove.originContext.potentialCeilingEffect, 'NONE');

  human.body.x = 2860;
  human.body.y = 535;
  updateFirstGroveProgress(state, world);
  assert.equal(state.firstGrove.currentRegionRef, 'region.first-grove.hushed-orchard');
  assert.equal(interact(state, world), true);
  assert.ok(state.firstGrove.acceptedOpportunityRefs.includes('opportunity.first-grove.orchard-inspection'));
  assert.ok(human.practice['practice.vexworld.orchard-inspection'].evidence > 0);

  human.body.x = 1510;
  human.body.y = 300;
  assert.equal(interact(state, world), true);
  assert.ok(state.firstGrove.discoveredRefs.includes('discovery.first-grove.sunshower-bell'));

  human.body.x = 5720;
  human.body.y = 245;
  updateFirstGroveProgress(state, world);
  assert.equal(state.firstGrove.currentRegionRef, 'region.first-grove.echo-overlook');
  assert.equal(interact(state, world), true);
  assert.ok(state.firstGrove.discoveredRefs.includes('discovery.first-grove.echo-petals'));

  human.body.x = 5540;
  human.body.y = 250;
  assert.equal(interact(state, world), true);
  assert.ok(state.firstGrove.visitedWitnessSiteRefs.includes('site.first-grove.echo-overlook'));
  assert.equal(state.quest.twinHorizonUnlocked, false);

  const witnessReceipt = [...state.receipts].reverse().find((receipt) => receipt.type === 'WORLD_WITNESS_SITE_VISITED');
  assert.equal(witnessReceipt.automaticFactPromotion, false);
  assert.equal(witnessReceipt.automaticAbilityGrant, false);
  assert.equal(witnessReceipt.relationshipWorthScoring, false);
});

test('distinct creature behavior profiles survive into runtime and affect deterministic movement tuning', async () => {
  const world = await compileFirstGrove({ root });
  const state = createInitialGame(world);
  const human = getHuman(state.party);
  human.body.x = 40;
  human.body.y = 530;
  for (const enemy of state.enemies) enemy.body.onGround = true;

  const curious = state.enemies.find((enemy) => enemy.behaviorProfileRef.includes('curious'));
  const orchard = state.enemies.find((enemy) => enemy.behaviorProfileRef.includes('orchard-loop'));
  assert.ok(curious);
  assert.ok(orchard);
  assert.notEqual(curious.behaviorProfileRef, orchard.behaviorProfileRef);

  updateEnemies(state, world, 1 / 60);
  assert.notEqual(curious.body.vx, orchard.body.vx);
});

test('Garden browser entry and renderer expose ritual, resident, discovery, region, and Witness readability surfaces', async () => {
  const html = await readFile(new URL('../versions/v1/src/web/index.html', import.meta.url), 'utf8');
  const script = await readFile(new URL('../versions/v1/src/web/origin-ritual.mjs', import.meta.url), 'utf8');
  const renderer = await readFile(new URL('../versions/v1/src/web/renderer.mjs', import.meta.url), 'utf8');
  assert.match(html, /Arrival ritual/);
  assert.match(html, /enter knowing the way home/i);
  assert.match(html, /id="origin-note"/);
  assert.match(html, /Enter First Grove/);
  assert.match(script, /potential/i);
  assert.match(script, /environment.*addEventListener/s);
  assert.match(renderer, /drawResident/);
  assert.match(renderer, /drawDiscovery/);
  assert.match(renderer, /drawWitnessSite/);
  assert.match(renderer, /drawRegionMarkers/);
  assert.match(renderer, /coordination is an invitation/);
});

// [VXG RealForever]
