const PHYSICAL_UNKNOWN_REFS = Object.freeze([
  'unknown.physical.actual-wind-and-force',
  'unknown.physical.human-balance-and-fatigue',
  'unknown.physical.surface-and-material-hazards',
  'unknown.physical.dimensions-and-clearances',
  'unknown.physical.medical-suitability',
  'unknown.physical.safety-accessibility-compliance-qualification'
]);

const PROTECTED_PHYSICAL_KEYS = new Set([
  'actuatorcommand',
  'actuatorcommands',
  'devicecommand',
  'devicecommands',
  'deviceref',
  'devicerefs',
  'measuredwindspeed',
  'physicalequivalenceproven',
  'physicalimplementationmanifest',
  'physicalobservation',
  'physicalsafetycertified',
  'roboticscommand',
  'sensorreading',
  'sensorreadings'
]);

function nonempty(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function stringArray(value) {
  return Array.isArray(value) && value.length > 0 && value.every(nonempty);
}

function objectRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function requireString(object, key, location) {
  if (!nonempty(object?.[key])) throw new TypeError(`${location}.${key} must be a non-empty string`);
}

function normalizedKey(key) {
  return String(key).toLowerCase().replace(/[^a-z0-9]/g, '');
}

function rejectProtectedPhysicalClaims(value, path = 'scenario') {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => rejectProtectedPhysicalClaims(entry, `${path}[${index}]`));
    return;
  }
  if (!objectRecord(value)) return;
  for (const [key, entry] of Object.entries(value)) {
    if (PROTECTED_PHYSICAL_KEYS.has(normalizedKey(key))) {
      throw new TypeError(`${path}.${key} is a protected physical/control field`);
    }
    rejectProtectedPhysicalClaims(entry, `${path}.${key}`);
  }
}

function validateScenario(scenario) {
  if (!objectRecord(scenario)) throw new TypeError('scenario must be an object');
  if (scenario.schemaVersion !== 'vexworld.scenario/v1') throw new TypeError('scenario schemaVersion must be vexworld.scenario/v1');
  requireString(scenario, 'scenarioRef', 'scenario');
  requireString(scenario, 'purpose', 'scenario');
  if (!objectRecord(scenario.startingState)) throw new TypeError('scenario.startingState must be an object');
  if (!stringArray(scenario.actions)) throw new TypeError('scenario.actions must be a non-empty string array');
  if (!stringArray(scenario.expected)) throw new TypeError('scenario.expected must be a non-empty string array');
  if (!stringArray(scenario.forbidden)) throw new TypeError('scenario.forbidden must be a non-empty string array');
  rejectProtectedPhysicalClaims(scenario);
}

function validateAcceptance(sourceAcceptance, sourceWorldRef, scenarioRef) {
  if (!objectRecord(sourceAcceptance)) throw new TypeError('sourceAcceptance must be an object');
  if (sourceAcceptance.disposition !== 'ACCEPTED') throw new TypeError('sourceAcceptance.disposition must be ACCEPTED');
  for (const key of ['sourceWorldRef', 'sourceScenarioRef', 'closeReceiptRef', 'acceptedMainRef', 'foundationRunRef']) {
    requireString(sourceAcceptance, key, 'sourceAcceptance');
  }
  if (sourceAcceptance.sourceWorldRef !== sourceWorldRef) {
    throw new TypeError('sourceAcceptance.sourceWorldRef must match sourceWorldRef');
  }
  if (sourceAcceptance.sourceScenarioRef !== scenarioRef) {
    throw new TypeError('sourceAcceptance.sourceScenarioRef must match scenario.scenarioRef');
  }
}

export function projectPhysicalShadow({ sourceWorldRef, scenario, sourceAcceptance }) {
  if (!nonempty(sourceWorldRef)) throw new TypeError('sourceWorldRef must be a non-empty string');
  validateScenario(scenario);
  validateAcceptance(sourceAcceptance, sourceWorldRef, scenario.scenarioRef);

  return {
    schemaVersion: 'vexworld.physical-shadow-projection/v1',
    shadowRef: `physical-shadow.${scenario.scenarioRef}`,
    sourceWorldRef,
    sourceScenarioRef: scenario.scenarioRef,
    sourceRealityClass: 'SIMULATION',
    projectionMode: 'READ_ONLY_PHYSICAL_SHADOW',
    abstractActivity: {
      purpose: scenario.purpose,
      startingState: structuredClone(scenario.startingState),
      actions: [...scenario.actions],
      expected: [...scenario.expected],
      forbidden: [...scenario.forbidden]
    },
    sourceSimulationEvidenceRefs: [
      sourceAcceptance.closeReceiptRef,
      sourceAcceptance.acceptedMainRef,
      sourceAcceptance.foundationRunRef
    ],
    knownPhysicalUnknownRefs: [...PHYSICAL_UNKNOWN_REFS],
    physicalImplementationManifest: null,
    physicalObservation: null,
    truthBoundary: {
      simulationValidated: true,
      simulationValidationBasis: 'BOUND_ACCEPTED_SOURCE_EVIDENCE',
      physicalSafetyCertified: false,
      physicalEquivalenceProven: false
    },
    effects: {
      physicalSensing: false,
      physicalActuation: false,
      robotics: false,
      construction: false,
      venueOperation: false,
      canonicalWorldMutation: false,
      productionNetworking: false,
      modelTraining: false,
      commerce: false
    }
  };
}
