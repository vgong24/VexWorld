import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  classifyReturnMargin,
  updateResourceProjection,
  weatherCostMultiplier
} from '../src/core/resource-state.mjs';

const member = {
  body: { x: 1000, y: 500 },
  resources: { energy: 22, maxEnergy: 100, reserveRequired: 12, restorationMethods: ['dock'] }
};
const world = {
  map: { restorationPoints: [{ entityRef:'rest', x:0, y:500, methods:['dock'] }] },
  weather: { state: 'RAIN' },
  laws: { movement: { companionSpeed: 200 }, resource: { moveCostPerSecond:.6, rainMultiplier:1.4 } }
};

test('return margin considers reachable compatible restoration and environment', () => {
  const result = updateResourceProjection(member, world);
  assert.equal(result.nearest.entityRef, 'rest');
  assert.ok(result.predictedReturnCost > 0);
  assert.notEqual(result.band, 'AVAILABLE_MARGIN');
});

test('resource bands are calm margin classes rather than battery-only thresholds', () => {
  assert.equal(classifyReturnMargin({ margin: 60, maxEnergy:100, requiredReserve:12 }), 'AVAILABLE_MARGIN');
  assert.equal(classifyReturnMargin({ margin: 15, maxEnergy:100, requiredReserve:12 }), 'RESTORATION_RECOMMENDED');
  assert.equal(classifyReturnMargin({ margin: 5, maxEnergy:100, requiredReserve:12 }), 'RETURN_MARGIN_LOW');
  assert.equal(classifyReturnMargin({ margin: -1, maxEnergy:100, requiredReserve:12 }), 'PROTECTIVE_RETURN_OR_HALT');
});

test('declared UPDRAFT scenario recalculates return margin headlessly under identical geometry', async () => {
  const [laws, scenario] = await Promise.all([
    readFile(new URL('../worlds/first-grove/laws.json', import.meta.url), 'utf8').then(JSON.parse),
    readFile(new URL('../worlds/first-grove/scenarios/updraft-return-margin.json', import.meta.url), 'utf8').then(JSON.parse)
  ]);
  const fixture = scenario.startingState;

  assert.equal(scenario.scenarioRef, 'scenario.first-grove.updraft-return-margin');
  assert.equal(fixture.sameActorEnergy, true);
  assert.equal(fixture.sameRestorationDistance, true);
  assert.ok(laws.weather.states.includes(fixture.changedWeather));
  assert.equal(fixture.changedWeather, 'UPDRAFT');
  assert.equal(laws.resource.updraftMultiplier, 1.3);
  assert.equal(weatherCostMultiplier(fixture.changedWeather, laws), 1.3);

  const makeMember = () => ({
    body: { x: fixture.restorationDistance, y: 500 },
    resources: {
      energy: fixture.companionEnergy,
      maxEnergy: 100,
      reserveRequired: 12,
      restorationMethods: ['restoration.vextory.sunlight']
    }
  });
  const makeWorld = (state) => ({
    map: {
      restorationPoints: [{
        entityRef: 'fixture.updraft.restoration',
        x: 0,
        y: 500,
        methods: ['restoration.vextory.sunlight']
      }]
    },
    weather: { state },
    laws
  });

  const clear = updateResourceProjection(makeMember(), makeWorld(fixture.startingWeather));
  const updraft = updateResourceProjection(makeMember(), makeWorld(fixture.changedWeather));

  assert.equal(clear.band, fixture.expectedClearBand);
  assert.equal(updraft.band, fixture.expectedUpdraftBand);
  assert.ok(updraft.predictedReturnCost > clear.predictedReturnCost);
  assert.ok(updraft.returnMargin < clear.returnMargin);

  const secondUpdraft = updateResourceProjection(makeMember(), makeWorld(fixture.changedWeather));
  assert.deepEqual(secondUpdraft, updraft);
});

test('UPDRAFT addition preserves accepted weather cost multipliers', async () => {
  const laws = JSON.parse(await readFile(new URL('../worlds/first-grove/laws.json', import.meta.url), 'utf8'));
  assert.equal(weatherCostMultiplier('RAIN', laws), 1.35);
  assert.equal(weatherCostMultiplier('SNOW', laws), 1.45);
  assert.equal(weatherCostMultiplier('SAND_WIND', laws), 1.55);
  assert.equal(weatherCostMultiplier('MIST', laws), 1.1);
  assert.equal(weatherCostMultiplier('CLEAR', laws), 1);
});

test('UPDRAFT fails closed when its declared resource multiplier is missing or malformed', () => {
  const invalid = [
    undefined,
    0,
    -1,
    '1.3',
    Number.POSITIVE_INFINITY,
    Number.NaN
  ];
  for (const updraftMultiplier of invalid) {
    assert.throws(
      () => weatherCostMultiplier('UPDRAFT', { resource: { updraftMultiplier } }),
      /UPDRAFT requires finite positive laws\.resource\.updraftMultiplier/
    );
  }
});
