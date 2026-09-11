import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { compileFirstGrove } from '../versions/v1/src/compiler/world-compiler.mjs';

const root = new URL('../versions/v1/', import.meta.url);

test('First Grove source forms a five-region outward-and-return adventure rather than a flat demonstration field', async () => {
  const world = await compileFirstGrove({ root: root.pathname });
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
  const world = await compileFirstGrove({ root: root.pathname });
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
  const world = await compileFirstGrove({ root: root.pathname });
  const resident = world.map.residents.find((entry) => entry.residentRef === 'resident.first-grove.ilex');
  const opportunity = world.map.opportunities.find((entry) => entry.opportunityRef === 'opportunity.first-grove.orchard-inspection');
  assert.equal(resident.roleIsIdentity, false);
  assert.equal(opportunity.practiceRef, 'practice.vexworld.orchard-inspection');
  assert.equal(opportunity.voluntary, true);
  assert.equal(opportunity.declinePenalty, 'NONE');
  assert.equal(opportunity.completionAuthority, 'SCENARIO_EVIDENCE_ONLY');
});

test('cooperative encounter and World Witness remain invitations rather than hidden relationship scoring', async () => {
  const world = await compileFirstGrove({ root: root.pathname });
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
  const world = await compileFirstGrove({ root: root.pathname });
  const behaviors = new Set(world.map.enemies.map((enemy) => enemy.behaviorProfileRef));
  assert.ok(behaviors.size >= 5);
  assert.ok(world.map.discoveries.length >= 2);
  assert.ok(world.map.discoveries.every((discovery) => discovery.optional === true));
  assert.equal(world.manifest.partyCapacity, 4);
});

test('Garden browser entry presents an in-world arrival ritual and origin response surface', async () => {
  const html = await readFile(new URL('../versions/v1/src/web/index.html', import.meta.url), 'utf8');
  const script = await readFile(new URL('../versions/v1/src/web/origin-ritual.mjs', import.meta.url), 'utf8');
  assert.match(html, /Arrival ritual/);
  assert.match(html, /enter knowing the way home/i);
  assert.match(html, /id="origin-note"/);
  assert.match(html, /Enter First Grove/);
  assert.match(script, /potential/i);
  assert.match(script, /environment.*addEventListener/s);
});

// [VXG RealForever]
