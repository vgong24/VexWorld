import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import {
  projectPhysicalShadow,
  scenarioSemanticSha256
} from '../src/core/physical-shadow.mjs';

const SOURCE_WORLD_REF = 'world.vexworld.first-grove';
const SOURCE_SCENARIO_REF = 'scenario.first-grove.updraft-return-margin';
const SOURCE_SCENARIO_SEMANTIC_SHA256 = 'e6765d50937bdbf3b60b3c40d8abcf4c5d305f7b1be57d04cee73265f47b6c66';

const ACCEPTANCE = Object.freeze({
  disposition: 'ACCEPTED',
  sourceWorldRef: SOURCE_WORLD_REF,
  sourceScenarioRef: SOURCE_SCENARIO_REF,
  sourceScenarioSemanticSha256: SOURCE_SCENARIO_SEMANTIC_SHA256,
  closeReceiptRef: 'github.issue.vexworld.61.comment.5656924894',
  acceptedMainRef: 'github.commit.vexworld.e0e868aa3fa68ccf87b11616b80bfa036ce89c61',
  foundationRunRef: 'github.actions.vexworld.34789122616'
});

async function loadScenario() {
  return JSON.parse(await readFile(
    new URL('../worlds/first-grove/scenarios/updraft-return-margin.json', import.meta.url),
    'utf8'
  ));
}

function project(scenario, sourceAcceptance = ACCEPTANCE) {
  return projectPhysicalShadow({
    sourceWorldRef: SOURCE_WORLD_REF,
    scenario,
    sourceAcceptance
  });
}

test('accepted UPDRAFT scenario projects into a deterministic read-only physical shadow', async () => {
  const scenario = await loadScenario();
  assert.equal(scenarioSemanticSha256(scenario), SOURCE_SCENARIO_SEMANTIC_SHA256);

  const first = project(scenario);
  const second = project(scenario);

  assert.deepEqual(second, first);
  assert.equal(first.schemaVersion, 'vexworld.physical-shadow-projection/v1');
  assert.equal(first.shadowRef, `physical-shadow.${SOURCE_SCENARIO_REF}`);
  assert.equal(first.sourceWorldRef, SOURCE_WORLD_REF);
  assert.equal(first.sourceScenarioRef, SOURCE_SCENARIO_REF);
  assert.equal(first.sourceScenarioSemanticSha256, SOURCE_SCENARIO_SEMANTIC_SHA256);
  assert.equal(first.sourceRealityClass, 'SIMULATION');
  assert.equal(first.projectionMode, 'READ_ONLY_PHYSICAL_SHADOW');

  assert.deepEqual(first.abstractActivity, {
    purpose: scenario.purpose,
    startingState: scenario.startingState,
    actions: scenario.actions,
    expected: scenario.expected,
    forbidden: scenario.forbidden
  });
  assert.deepEqual(first.sourceSimulationEvidenceRefs, [
    ACCEPTANCE.closeReceiptRef,
    ACCEPTANCE.acceptedMainRef,
    ACCEPTANCE.foundationRunRef
  ]);

  for (const requiredUnknown of [
    'unknown.physical.actual-wind-and-force',
    'unknown.physical.human-balance-and-fatigue',
    'unknown.physical.surface-and-material-hazards',
    'unknown.physical.dimensions-and-clearances',
    'unknown.physical.medical-suitability',
    'unknown.physical.safety-accessibility-compliance-qualification'
  ]) {
    assert.ok(first.knownPhysicalUnknownRefs.includes(requiredUnknown));
  }

  assert.equal(first.physicalImplementationManifest, null);
  assert.equal(first.physicalObservation, null);
  assert.deepEqual(first.truthBoundary, {
    simulationValidated: true,
    simulationValidationBasis: 'BOUND_ACCEPTED_SOURCE_EVIDENCE_AND_SCENARIO_DIGEST',
    physicalSafetyCertified: false,
    physicalEquivalenceProven: false
  });
  assert.deepEqual(first.effects, {
    physicalSensing: false,
    physicalActuation: false,
    robotics: false,
    construction: false,
    venueOperation: false,
    canonicalWorldMutation: false,
    productionNetworking: false,
    modelTraining: false,
    commerce: false
  });
});

test('physical shadow is a deep copy and cannot mutate its accepted source scenario', async () => {
  const scenario = await loadScenario();
  const original = structuredClone(scenario);
  const shadow = project(scenario);

  shadow.abstractActivity.startingState.changedWeather = 'MEASURED_REAL_WIND';
  shadow.abstractActivity.actions.push('ACTUATE_DEVICE');
  shadow.abstractActivity.expected[0] = 'PHYSICAL_SAFETY_CERTIFIED';
  shadow.abstractActivity.forbidden.length = 0;

  assert.deepEqual(scenario, original);
  assert.equal(scenario.startingState.changedWeather, 'UPDRAFT');
  assert.ok(!scenario.actions.includes('ACTUATE_DEVICE'));
});

test('accepted evidence cannot be applied to mutated same-ref scenario semantics', async () => {
  const scenario = await loadScenario();
  const mutations = [
    (value) => { value.purpose = `${value.purpose} mutated`; },
    (value) => { value.startingState.companionEnergy += 1; },
    (value) => { value.actions = [...value.actions, 'UNREVIEWED_ACTION']; },
    (value) => { value.expected[0] = 'unreviewed expected meaning'; },
    (value) => { value.forbidden = value.forbidden.slice(1); }
  ];

  for (const mutate of mutations) {
    const changed = structuredClone(scenario);
    mutate(changed);
    assert.equal(changed.scenarioRef, SOURCE_SCENARIO_REF);
    assert.notEqual(scenarioSemanticSha256(changed), SOURCE_SCENARIO_SEMANTIC_SHA256);
    assert.throws(
      () => project(changed),
      /sourceAcceptance\.sourceScenarioSemanticSha256 must match scenario semantics/
    );
  }

  assert.throws(
    () => project(scenario, { ...ACCEPTANCE, sourceScenarioSemanticSha256: '0'.repeat(64) }),
    /sourceAcceptance\.sourceScenarioSemanticSha256 must match scenario semantics/
  );
  assert.throws(
    () => project(scenario, { ...ACCEPTANCE, sourceScenarioSemanticSha256: 'not-a-digest' }),
    /sourceAcceptance\.sourceScenarioSemanticSha256 must be a SHA-256 hex digest/
  );
});

test('digital UPDRAFT remains simulation meaning rather than physical observation or implementation', async () => {
  const scenario = await loadScenario();
  const shadow = project(scenario);

  assert.equal(shadow.abstractActivity.startingState.changedWeather, 'UPDRAFT');
  assert.equal(shadow.abstractActivity.startingState.companionEnergy, 40);
  assert.equal(shadow.physicalObservation, null);
  assert.equal(shadow.physicalImplementationManifest, null);
  assert.equal(shadow.truthBoundary.physicalSafetyCertified, false);
  assert.equal(shadow.truthBoundary.physicalEquivalenceProven, false);

  const serialized = JSON.stringify(shadow);
  assert.doesNotMatch(serialized, /measuredWindSpeed/i);
  assert.doesNotMatch(serialized, /humanFatigue/i);
  assert.doesNotMatch(serialized, /actuatorCommand/i);
});

test('protected physical truth and authority claims are rejected recursively before projection', async () => {
  const source = await loadScenario();
  const injections = [
    ['actuatorCommand', { actuatorCommand: 'MOVE_PLATFORM' }],
    ['actuator_command', { nested: { actuator_command: 'MOVE_PLATFORM' } }],
    ['measuredWindSpeed', { nested: { measuredWindSpeed: 12 } }],
    ['physical_safety_certified', { nested: [{ physical_safety_certified: true }] }],
    ['physicalEquivalenceProven', { nested: { physicalEquivalenceProven: true } }],
    ['physicalActuation', { nested: { physicalActuation: true } }],
    ['physicalSensing', { nested: { physicalSensing: true } }],
    ['robotics', { nested: { robotics: true } }],
    ['construction', { nested: { construction: true } }],
    ['venueOperation', { nested: { venueOperation: true } }],
    ['canonicalWorldMutation', { nested: { canonicalWorldMutation: true } }],
    ['deviceRef', { nested: { deviceRef: 'device.real.fan' } }],
    ['sensorReading', { nested: { sensorReading: { wind: 12 } } }]
  ];

  for (const [name, injection] of injections) {
    const scenario = structuredClone(source);
    Object.assign(scenario.startingState, injection);
    assert.throws(
      () => project(scenario),
      /protected physical\/control field/,
      name
    );
  }
});

test('acceptance evidence must bind the exact projected world and scenario', async () => {
  const scenario = await loadScenario();

  assert.throws(
    () => project(scenario, { ...ACCEPTANCE, sourceWorldRef: 'world.other' }),
    /sourceAcceptance\.sourceWorldRef must match sourceWorldRef/
  );
  assert.throws(
    () => project(scenario, { ...ACCEPTANCE, sourceScenarioRef: 'scenario.other' }),
    /sourceAcceptance\.sourceScenarioRef must match scenario\.scenarioRef/
  );
  assert.throws(
    () => project(scenario, { ...ACCEPTANCE, disposition: 'CANDIDATE' }),
    /sourceAcceptance\.disposition must be ACCEPTED/
  );
});

test('malformed or semantically empty source scenario contracts fail closed', async () => {
  const source = await loadScenario();
  const cases = [
    [
      { ...source, schemaVersion: 'vexworld.scenario/v0' },
      /scenario schemaVersion must be vexworld\.scenario\/v1/
    ],
    [
      { ...source, scenarioRef: '' },
      /scenario\.scenarioRef must be a non-empty string/
    ],
    [
      { ...source, purpose: '' },
      /scenario\.purpose must be a non-empty string/
    ],
    [
      { ...source, startingState: null },
      /scenario\.startingState must be an object/
    ],
    [
      { ...source, actions: [] },
      /scenario\.actions must be a non-empty string array/
    ],
    [
      { ...source, expected: [] },
      /scenario\.expected must be a non-empty string array/
    ],
    [
      { ...source, forbidden: [] },
      /scenario\.forbidden must be a non-empty string array/
    ],
    [
      { ...source, actions: [''] },
      /scenario\.actions must be a non-empty string array/
    ]
  ];

  for (const [scenario, expectedError] of cases) {
    assert.throws(() => project(scenario), expectedError);
  }
});
