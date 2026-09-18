import {
  assertExactKeys,
  assertFiniteNumber,
  assertNonNegativeInteger,
  assertPlainObject,
  assertPositiveInteger,
  assertSafeRef,
  assertSha256,
  assertUniqueSafeRefs,
  canonicalClone,
  frozenCanonical,
  hashCanonical,
  rejectHiddenReasoning
} from './canonical.mjs';

export const MOTION_TAIL_SCHEMA = 'vexworld.motion-hot-tail/v1';
export const MOTION_SAMPLE_SCHEMA = 'vexworld.motion-sample/v1';
export const MOTION_WINDOW_SCHEMA = 'vexworld.promoted-motion-window/v1';
export const MOTION_CAPTURE_SOURCE_SCHEMA = 'vexworld.synthetic-motion-capture-source/v1';
export const QUALIFIED_MOTION_SAMPLE_SCHEMA = 'vexworld.qualified-motion-sample/v1';
export const MOTION_QUANTIZATION_PROFILE = 'motion.quantization.mm-and-microquaternion.v1';
export const MOTION_CAPTURE_MODE = 'SYNTHETIC_FIXTURE_ONLY';

export const MOTION_PRIVACY_CLASSES = Object.freeze([
  'PARTICIPANT_PRIVATE',
  'PARTY_SHARED',
  'PUBLIC_WORLD'
]);

export const MOTION_RETENTION_CLASSES = Object.freeze([
  'EPHEMERAL_HOT_TAIL',
  'SESSION_REPLAY',
  'EVENT_EVIDENCE',
  'EXPLICIT_SAVED_MOMENT'
]);

export const MOTION_TRANSPORT_QUALITIES = Object.freeze([
  'DIRECT_OBSERVED',
  'INTERPOLATED_ESTIMATE',
  'GAP_MARKER'
]);

const privacySet = new Set(MOTION_PRIVACY_CLASSES);
const retentionSet = new Set(MOTION_RETENTION_CLASSES);
const transportQualitySet = new Set(MOTION_TRANSPORT_QUALITIES);

function assertPrivacy(value, label) {
  if (!privacySet.has(value)) throw new TypeError(`${label} is not a supported motion privacy class`);
  return value;
}

function assertRetention(value, label) {
  if (!retentionSet.has(value)) throw new TypeError(`${label} is not a supported motion retention class`);
  return value;
}

function assertTransportQuality(value, label) {
  if (!transportQualitySet.has(value)) {
    throw new TypeError(`${label} is not a supported motion transport quality`);
  }
  return value;
}

export function verifySyntheticMotionCaptureSource(source) {
  assertPlainObject(source, 'motion capture source');
  assertExactKeys(source, [
    'schemaVersion', 'captureMode', 'captureSourceRef', 'participantRef',
    'sourceClassRef', 'coordinateSpaceRef', 'deviceClockDomainRef',
    'clockAlignmentRef', 'clockAlignmentDomainRef', 'calibrationRef',
    'calibrationCoordinateSpaceRef', 'transportProfileRef', 'privacyClass',
    'retentionClass', 'captureSourceSha256'
  ], 'motion capture source');
  if (source.schemaVersion !== MOTION_CAPTURE_SOURCE_SCHEMA) {
    throw new TypeError('motion capture source schema mismatch');
  }
  if (source.captureMode !== MOTION_CAPTURE_MODE) {
    throw new TypeError('motion capture source must remain synthetic-fixture-only');
  }
  for (const [key, value] of [
    ['captureSourceRef', source.captureSourceRef],
    ['participantRef', source.participantRef],
    ['sourceClassRef', source.sourceClassRef],
    ['coordinateSpaceRef', source.coordinateSpaceRef],
    ['deviceClockDomainRef', source.deviceClockDomainRef],
    ['clockAlignmentRef', source.clockAlignmentRef],
    ['clockAlignmentDomainRef', source.clockAlignmentDomainRef],
    ['calibrationRef', source.calibrationRef],
    ['calibrationCoordinateSpaceRef', source.calibrationCoordinateSpaceRef],
    ['transportProfileRef', source.transportProfileRef]
  ]) assertSafeRef(value, `motion capture source.${key}`);
  if (source.clockAlignmentDomainRef !== source.deviceClockDomainRef) {
    throw new TypeError('motion capture source clock-alignment domain mismatch');
  }
  if (source.calibrationCoordinateSpaceRef !== source.coordinateSpaceRef) {
    throw new TypeError('motion capture source calibration coordinate-space mismatch');
  }
  assertPrivacy(source.privacyClass, 'motion capture source.privacyClass');
  assertRetention(source.retentionClass, 'motion capture source.retentionClass');
  if (source.retentionClass !== 'EPHEMERAL_HOT_TAIL') {
    throw new TypeError('motion capture source must begin with EPHEMERAL_HOT_TAIL retention');
  }
  rejectHiddenReasoning(source, 'motion capture source');
  assertSha256(source.captureSourceSha256, 'motion capture source.captureSourceSha256');
  const { captureSourceSha256, ...body } = source;
  if (hashCanonical(body) !== captureSourceSha256) {
    throw new TypeError('motion capture source digest mismatch');
  }
  return source;
}

export function formSyntheticMotionCaptureSource(input) {
  assertExactKeys(input, [
    'captureSourceRef', 'participantRef', 'sourceClassRef', 'coordinateSpaceRef',
    'deviceClockDomainRef', 'clockAlignmentRef', 'clockAlignmentDomainRef',
    'calibrationRef', 'calibrationCoordinateSpaceRef', 'transportProfileRef',
    'privacyClass', 'retentionClass'
  ], 'motion capture source input');
  const body = {
    schemaVersion: MOTION_CAPTURE_SOURCE_SCHEMA,
    captureMode: MOTION_CAPTURE_MODE,
    ...canonicalClone(input)
  };
  const formed = frozenCanonical({ ...body, captureSourceSha256: hashCanonical(body) });
  verifySyntheticMotionCaptureSource(formed);
  return formed;
}

function assertSafeInteger(value, label) {
  if (!Number.isSafeInteger(value)) throw new TypeError(`${label} must be a safe integer`);
  return value;
}

function quantize(value, scale, label) {
  assertFiniteNumber(value, label);
  const result = Math.round(value * scale);
  if (!Number.isSafeInteger(result)) throw new TypeError(`${label} exceeds quantized safe-integer range`);
  return result;
}

function quantizeVec3(value, scale, label) {
  assertExactKeys(value, ['x', 'y', 'z'], label);
  return {
    x: quantize(value.x, scale, `${label}.x`),
    y: quantize(value.y, scale, `${label}.y`),
    z: quantize(value.z, scale, `${label}.z`)
  };
}

function quantizeQuaternion(value, label) {
  assertExactKeys(value, ['x', 'y', 'z', 'w'], label);
  const result = {
    x: quantize(value.x, 1_000_000, `${label}.x`),
    y: quantize(value.y, 1_000_000, `${label}.y`),
    z: quantize(value.z, 1_000_000, `${label}.z`),
    w: quantize(value.w, 1_000_000, `${label}.w`)
  };
  const magnitudeSquared = Object.values(result).reduce((sum, component) => sum + (component * component), 0);
  const lower = 900_000 ** 2;
  const upper = 1_100_000 ** 2;
  if (magnitudeSquared < lower || magnitudeSquared > upper) {
    throw new TypeError(`${label} must be approximately unit length before quantization`);
  }
  return result;
}

function validateQuantizedVec3(value, label) {
  assertExactKeys(value, ['x', 'y', 'z'], label);
  assertSafeInteger(value.x, `${label}.x`);
  assertSafeInteger(value.y, `${label}.y`);
  assertSafeInteger(value.z, `${label}.z`);
  return value;
}

function validateQuantizedQuaternion(value, label) {
  assertExactKeys(value, ['x', 'y', 'z', 'w'], label);
  for (const component of ['x', 'y', 'z', 'w']) {
    assertSafeInteger(value[component], `${label}.${component}`);
  }
  const magnitudeSquared = Object.values(value).reduce((sum, component) => sum + (component * component), 0);
  const lower = 900_000 ** 2;
  const upper = 1_100_000 ** 2;
  if (magnitudeSquared < lower || magnitudeSquared > upper) {
    throw new TypeError(`${label} must remain approximately unit length after quantization`);
  }
  return value;
}

function validateQuantizedPose(pose) {
  assertExactKeys(pose, [
    'quantizationProfileRef',
    'positionMillimeters',
    'orientationMicroQuaternion',
    'linearVelocityMillimetersPerSecondOrNull',
    'angularVelocityMicroradiansPerSecondOrNull'
  ], 'quantized motion pose');
  if (pose.quantizationProfileRef !== MOTION_QUANTIZATION_PROFILE) {
    throw new TypeError('quantized motion pose profile mismatch');
  }
  validateQuantizedVec3(pose.positionMillimeters, 'positionMillimeters');
  validateQuantizedQuaternion(pose.orientationMicroQuaternion, 'orientationMicroQuaternion');
  if (pose.linearVelocityMillimetersPerSecondOrNull !== null) {
    validateQuantizedVec3(
      pose.linearVelocityMillimetersPerSecondOrNull,
      'linearVelocityMillimetersPerSecondOrNull'
    );
  }
  if (pose.angularVelocityMicroradiansPerSecondOrNull !== null) {
    validateQuantizedVec3(
      pose.angularVelocityMicroradiansPerSecondOrNull,
      'angularVelocityMicroradiansPerSecondOrNull'
    );
  }
  return pose;
}

export function quantizeMotionPose(input) {
  assertExactKeys(input, [
    'positionMeters',
    'orientationQuaternion',
    'linearVelocityMetersPerSecondOrNull',
    'angularVelocityRadiansPerSecondOrNull'
  ], 'motion pose input');
  const pose = {
    quantizationProfileRef: MOTION_QUANTIZATION_PROFILE,
    positionMillimeters: quantizeVec3(input.positionMeters, 1000, 'positionMeters'),
    orientationMicroQuaternion: quantizeQuaternion(input.orientationQuaternion, 'orientationQuaternion'),
    linearVelocityMillimetersPerSecondOrNull: input.linearVelocityMetersPerSecondOrNull === null
      ? null
      : quantizeVec3(input.linearVelocityMetersPerSecondOrNull, 1000, 'linearVelocityMetersPerSecondOrNull'),
    angularVelocityMicroradiansPerSecondOrNull: input.angularVelocityRadiansPerSecondOrNull === null
      ? null
      : quantizeVec3(input.angularVelocityRadiansPerSecondOrNull, 1_000_000, 'angularVelocityRadiansPerSecondOrNull')
  };
  return frozenCanonical(pose);
}

export function createMotionTail(input) {
  assertExactKeys(input, [
    'tailRef', 'participantRef', 'coordinateSpaceRef', 'maxSamples', 'maxAgeTicks',
    'privacyClass', 'retentionClass'
  ], 'motion tail input');
  assertSafeRef(input.tailRef, 'tailRef');
  assertSafeRef(input.participantRef, 'participantRef');
  assertSafeRef(input.coordinateSpaceRef, 'coordinateSpaceRef');
  assertPositiveInteger(input.maxSamples, 'maxSamples');
  assertPositiveInteger(input.maxAgeTicks, 'maxAgeTicks');
  assertPrivacy(input.privacyClass, 'privacyClass');
  assertRetention(input.retentionClass, 'retentionClass');
  if (input.retentionClass !== 'EPHEMERAL_HOT_TAIL') {
    throw new TypeError('a live motion tail must use EPHEMERAL_HOT_TAIL retention');
  }
  return frozenCanonical({
    schemaVersion: MOTION_TAIL_SCHEMA,
    tailRef: input.tailRef,
    participantRef: input.participantRef,
    coordinateSpaceRef: input.coordinateSpaceRef,
    quantizationProfileRef: MOTION_QUANTIZATION_PROFILE,
    maxSamples: input.maxSamples,
    maxAgeTicks: input.maxAgeTicks,
    privacyClass: input.privacyClass,
    retentionClass: input.retentionClass,
    samples: [],
    latestTickOrNull: null,
    latestSequenceOrNull: null
  });
}

function sampleBody(tail, input) {
  assertExactKeys(input, ['sequence', 'tick', 'sourceRef', 'pose', 'materialityRefs'], 'motion sample input');
  assertNonNegativeInteger(input.sequence, 'motion sample sequence');
  assertNonNegativeInteger(input.tick, 'motion sample tick');
  assertSafeRef(input.sourceRef, 'motion sample sourceRef');
  assertUniqueSafeRefs(input.materialityRefs, 'motion sample materialityRefs');
  const pose = quantizeMotionPose(input.pose);
  if (tail.latestSequenceOrNull !== null && input.sequence <= tail.latestSequenceOrNull) {
    throw new TypeError('motion sample sequence must increase strictly');
  }
  if (tail.latestTickOrNull !== null && input.tick < tail.latestTickOrNull) {
    throw new TypeError('motion sample tick cannot move backward');
  }
  return {
    schemaVersion: MOTION_SAMPLE_SCHEMA,
    sampleRef: `${tail.tailRef}.sample.${String(input.sequence).padStart(10, '0')}`,
    tailRef: tail.tailRef,
    participantRef: tail.participantRef,
    coordinateSpaceRef: tail.coordinateSpaceRef,
    sequence: input.sequence,
    tick: input.tick,
    sourceRef: input.sourceRef,
    pose: canonicalClone(pose),
    materialityRefs: [...input.materialityRefs]
  };
}

export function appendMotionSample(tail, input) {
  verifyMotionTail(tail);
  const body = sampleBody(tail, input);
  const sample = frozenCanonical({ ...body, sampleSha256: hashCanonical(body) });
  const ageFloor = Math.max(0, sample.tick - tail.maxAgeTicks);
  const eligible = [...tail.samples.map(canonicalClone), canonicalClone(sample)]
    .filter((entry) => entry.tick >= ageFloor);
  const samples = eligible.slice(Math.max(0, eligible.length - tail.maxSamples));
  const next = frozenCanonical({
    ...canonicalClone(tail),
    samples,
    latestTickOrNull: sample.tick,
    latestSequenceOrNull: sample.sequence
  });
  return Object.freeze({ tail: next, sample });
}

function qualifiedSampleBody(tail, captureSource, input) {
  verifySyntheticMotionCaptureSource(captureSource);
  assertExactKeys(input, [
    'sequence', 'tick', 'sourceTimeMicroseconds', 'transportQuality',
    'poseOrNull', 'materialityRefs'
  ], 'qualified motion sample input');
  if (
    captureSource.participantRef !== tail.participantRef ||
    captureSource.coordinateSpaceRef !== tail.coordinateSpaceRef ||
    captureSource.privacyClass !== tail.privacyClass ||
    captureSource.retentionClass !== tail.retentionClass
  ) {
    throw new TypeError('motion capture source does not match tail owner/privacy/retention coordinates');
  }
  assertNonNegativeInteger(input.sequence, 'qualified motion sample sequence');
  assertNonNegativeInteger(input.tick, 'qualified motion sample tick');
  assertNonNegativeInteger(input.sourceTimeMicroseconds, 'qualified motion sample sourceTimeMicroseconds');
  assertTransportQuality(input.transportQuality, 'qualified motion sample transportQuality');
  assertUniqueSafeRefs(input.materialityRefs, 'qualified motion sample materialityRefs');

  const gap = input.transportQuality === 'GAP_MARKER';
  if (gap && input.poseOrNull !== null) {
    throw new TypeError('GAP_MARKER must not fabricate a motion pose');
  }
  if (!gap && input.poseOrNull === null) {
    throw new TypeError('observed/interpolated qualified samples require a pose');
  }

  if (tail.latestSequenceOrNull !== null && input.sequence <= tail.latestSequenceOrNull) {
    throw new TypeError('motion sample sequence must increase strictly');
  }
  if (tail.latestTickOrNull !== null && input.tick < tail.latestTickOrNull) {
    throw new TypeError('motion sample tick cannot move backward');
  }

  let priorQualifiedForSource = null;
  for (const entry of tail.samples) {
    if (
      entry.schemaVersion === QUALIFIED_MOTION_SAMPLE_SCHEMA &&
      entry.captureSource.captureSourceRef === captureSource.captureSourceRef
    ) {
      priorQualifiedForSource = entry;
    }
  }
  if (
    priorQualifiedForSource &&
    input.sourceTimeMicroseconds <= priorQualifiedForSource.sourceTimeMicroseconds
  ) {
    throw new TypeError('qualified motion source time must increase strictly within the retained tail');
  }

  return {
    schemaVersion: QUALIFIED_MOTION_SAMPLE_SCHEMA,
    sampleRef: `${tail.tailRef}.sample.${String(input.sequence).padStart(10, '0')}`,
    tailRef: tail.tailRef,
    participantRef: tail.participantRef,
    coordinateSpaceRef: tail.coordinateSpaceRef,
    sequence: input.sequence,
    tick: input.tick,
    sourceRef: captureSource.captureSourceRef,
    captureSource: canonicalClone(captureSource),
    sourceTimeMicroseconds: input.sourceTimeMicroseconds,
    transportQuality: input.transportQuality,
    poseOrNull: gap ? null : canonicalClone(quantizeMotionPose(input.poseOrNull)),
    materialityRefs: [...input.materialityRefs]
  };
}

export function appendQualifiedMotionSample(tail, captureSource, input) {
  verifyMotionTail(tail);
  const body = qualifiedSampleBody(tail, captureSource, input);
  const sample = frozenCanonical({ ...body, sampleSha256: hashCanonical(body) });
  const ageFloor = Math.max(0, sample.tick - tail.maxAgeTicks);
  const eligible = [...tail.samples.map(canonicalClone), canonicalClone(sample)]
    .filter((entry) => entry.tick >= ageFloor);
  const samples = eligible.slice(Math.max(0, eligible.length - tail.maxSamples));
  const next = frozenCanonical({
    ...canonicalClone(tail),
    samples,
    latestTickOrNull: sample.tick,
    latestSequenceOrNull: sample.sequence
  });
  return Object.freeze({ tail: next, sample });
}

function validateLegacyMotionSample(sample, owner) {
  assertExactKeys(sample, [
    'schemaVersion', 'sampleRef', 'tailRef', 'participantRef', 'coordinateSpaceRef',
    'sequence', 'tick', 'sourceRef', 'pose', 'materialityRefs', 'sampleSha256'
  ], 'motion sample');
  if (sample.schemaVersion !== MOTION_SAMPLE_SCHEMA) throw new TypeError('motion sample schema mismatch');
  assertSafeRef(sample.sampleRef, 'motion sample sampleRef');
  assertSafeRef(sample.tailRef, 'motion sample tailRef');
  assertSafeRef(sample.participantRef, 'motion sample participantRef');
  assertSafeRef(sample.coordinateSpaceRef, 'motion sample coordinateSpaceRef');
  if (
    sample.tailRef !== owner.tailRef ||
    sample.participantRef !== owner.participantRef ||
    sample.coordinateSpaceRef !== owner.coordinateSpaceRef
  ) {
    throw new TypeError('motion sample coordinate mismatch');
  }
  assertNonNegativeInteger(sample.sequence, 'motion sample sequence');
  assertNonNegativeInteger(sample.tick, 'motion sample tick');
  const expectedSampleRef = `${owner.tailRef}.sample.${String(sample.sequence).padStart(10, '0')}`;
  if (sample.sampleRef !== expectedSampleRef) throw new TypeError('motion sample ref mismatch');
  assertSafeRef(sample.sourceRef, 'motion sample sourceRef');
  validateQuantizedPose(sample.pose);
  assertUniqueSafeRefs(sample.materialityRefs, 'motion sample materialityRefs');
  rejectHiddenReasoning(sample, 'motion sample');
  assertSha256(sample.sampleSha256, 'motion sample sampleSha256');
  const { sampleSha256, ...body } = sample;
  if (hashCanonical(body) !== sampleSha256) throw new TypeError('motion sample digest mismatch');
  return sample;
}

function validateQualifiedMotionSample(sample, owner) {
  assertExactKeys(sample, [
    'schemaVersion', 'sampleRef', 'tailRef', 'participantRef', 'coordinateSpaceRef',
    'sequence', 'tick', 'sourceRef', 'captureSource', 'sourceTimeMicroseconds',
    'transportQuality', 'poseOrNull', 'materialityRefs', 'sampleSha256'
  ], 'qualified motion sample');
  if (sample.schemaVersion !== QUALIFIED_MOTION_SAMPLE_SCHEMA) {
    throw new TypeError('qualified motion sample schema mismatch');
  }
  assertSafeRef(sample.sampleRef, 'qualified motion sample sampleRef');
  assertSafeRef(sample.tailRef, 'qualified motion sample tailRef');
  assertSafeRef(sample.participantRef, 'qualified motion sample participantRef');
  assertSafeRef(sample.coordinateSpaceRef, 'qualified motion sample coordinateSpaceRef');
  if (
    sample.tailRef !== owner.tailRef ||
    sample.participantRef !== owner.participantRef ||
    sample.coordinateSpaceRef !== owner.coordinateSpaceRef
  ) {
    throw new TypeError('qualified motion sample coordinate mismatch');
  }
  assertNonNegativeInteger(sample.sequence, 'qualified motion sample sequence');
  assertNonNegativeInteger(sample.tick, 'qualified motion sample tick');
  const expectedSampleRef = `${owner.tailRef}.sample.${String(sample.sequence).padStart(10, '0')}`;
  if (sample.sampleRef !== expectedSampleRef) throw new TypeError('qualified motion sample ref mismatch');
  verifySyntheticMotionCaptureSource(sample.captureSource);
  if (sample.sourceRef !== sample.captureSource.captureSourceRef) {
    throw new TypeError('qualified motion sample sourceRef/captureSource mismatch');
  }
  if (
    sample.captureSource.participantRef !== owner.participantRef ||
    sample.captureSource.coordinateSpaceRef !== owner.coordinateSpaceRef
  ) {
    throw new TypeError('qualified motion sample capture source does not match owner coordinates');
  }
  if (
    owner.privacyClass !== undefined &&
    sample.captureSource.privacyClass !== owner.privacyClass
  ) {
    throw new TypeError('qualified motion sample capture source privacy does not match live tail');
  }
  if (
    owner.retentionClass !== undefined &&
    sample.captureSource.retentionClass !== owner.retentionClass
  ) {
    throw new TypeError('qualified motion sample capture source retention does not match live tail');
  }
  assertNonNegativeInteger(sample.sourceTimeMicroseconds, 'qualified motion sample sourceTimeMicroseconds');
  assertTransportQuality(sample.transportQuality, 'qualified motion sample transportQuality');
  const gap = sample.transportQuality === 'GAP_MARKER';
  if (gap) {
    if (sample.poseOrNull !== null) throw new TypeError('GAP_MARKER must not contain a motion pose');
  } else {
    if (sample.poseOrNull === null) throw new TypeError('observed/interpolated sample requires a pose');
    validateQuantizedPose(sample.poseOrNull);
  }
  assertUniqueSafeRefs(sample.materialityRefs, 'qualified motion sample materialityRefs');
  rejectHiddenReasoning(sample, 'qualified motion sample');
  assertSha256(sample.sampleSha256, 'qualified motion sample sampleSha256');
  const { sampleSha256, ...body } = sample;
  if (hashCanonical(body) !== sampleSha256) throw new TypeError('qualified motion sample digest mismatch');
  return sample;
}

function validateMotionSample(sample, owner) {
  if (sample?.schemaVersion === MOTION_SAMPLE_SCHEMA) {
    return validateLegacyMotionSample(sample, owner);
  }
  if (sample?.schemaVersion === QUALIFIED_MOTION_SAMPLE_SCHEMA) {
    return validateQualifiedMotionSample(sample, owner);
  }
  throw new TypeError('motion sample schema is not supported');
}

export function verifyMotionTail(tail) {
  assertExactKeys(tail, [
    'schemaVersion', 'tailRef', 'participantRef', 'coordinateSpaceRef',
    'quantizationProfileRef', 'maxSamples', 'maxAgeTicks', 'privacyClass',
    'retentionClass', 'samples', 'latestTickOrNull', 'latestSequenceOrNull'
  ], 'motion tail');
  if (tail.schemaVersion !== MOTION_TAIL_SCHEMA) throw new TypeError('motion tail schema mismatch');
  assertSafeRef(tail.tailRef, 'tail.tailRef');
  assertSafeRef(tail.participantRef, 'tail.participantRef');
  assertSafeRef(tail.coordinateSpaceRef, 'tail.coordinateSpaceRef');
  if (tail.quantizationProfileRef !== MOTION_QUANTIZATION_PROFILE) throw new TypeError('motion tail quantization profile mismatch');
  assertPositiveInteger(tail.maxSamples, 'tail.maxSamples');
  assertPositiveInteger(tail.maxAgeTicks, 'tail.maxAgeTicks');
  assertPrivacy(tail.privacyClass, 'tail.privacyClass');
  assertRetention(tail.retentionClass, 'tail.retentionClass');
  if (tail.retentionClass !== 'EPHEMERAL_HOT_TAIL') {
    throw new TypeError('a live motion tail must use EPHEMERAL_HOT_TAIL retention');
  }
  if (!Array.isArray(tail.samples) || tail.samples.length > tail.maxSamples) throw new TypeError('motion tail sample count invalid');
  let priorSequence = -1;
  let priorTick = -1;
  const priorQualifiedSourceTimeByRef = new Map();
  for (const sample of tail.samples) {
    validateMotionSample(sample, tail);
    if (sample.sequence <= priorSequence || sample.tick < priorTick) {
      throw new TypeError('motion tail sample order invalid');
    }
    if (sample.schemaVersion === QUALIFIED_MOTION_SAMPLE_SCHEMA) {
      const sourceRef = sample.captureSource.captureSourceRef;
      const priorSourceTime = priorQualifiedSourceTimeByRef.get(sourceRef);
      if (priorSourceTime !== undefined && sample.sourceTimeMicroseconds <= priorSourceTime) {
        throw new TypeError('qualified motion source time must increase strictly within the retained tail');
      }
      priorQualifiedSourceTimeByRef.set(sourceRef, sample.sourceTimeMicroseconds);
    }
    priorSequence = sample.sequence;
    priorTick = sample.tick;
  }
  const expectedTick = tail.samples.length ? tail.samples.at(-1).tick : null;
  const expectedSequence = tail.samples.length ? tail.samples.at(-1).sequence : null;
  if (tail.latestTickOrNull !== expectedTick || tail.latestSequenceOrNull !== expectedSequence) {
    throw new TypeError('motion tail terminal coordinate mismatch');
  }
  if (tail.samples.length) {
    const ageFloor = Math.max(0, expectedTick - tail.maxAgeTicks);
    if (tail.samples[0].tick < ageFloor) throw new TypeError('motion tail contains expired samples');
  }
  return tail;
}

export function expireMotionTail(tail, currentTick) {
  verifyMotionTail(tail);
  assertNonNegativeInteger(currentTick, 'currentTick');
  const ageFloor = Math.max(0, currentTick - tail.maxAgeTicks);
  const samples = tail.samples.filter((sample) => sample.tick >= ageFloor).map(canonicalClone);
  return frozenCanonical({
    ...canonicalClone(tail),
    samples,
    latestTickOrNull: samples.length ? samples.at(-1).tick : null,
    latestSequenceOrNull: samples.length ? samples.at(-1).sequence : null
  });
}

export function promoteMotionWindow(tail, input) {
  verifyMotionTail(tail);
  assertExactKeys(input, [
    'windowRef', 'fromTick', 'toTick', 'reasonRef', 'consentRefOrNull',
    'privacyClass', 'retentionClass', 'eventRefs'
  ], 'motion window input');
  assertSafeRef(input.windowRef, 'windowRef');
  assertNonNegativeInteger(input.fromTick, 'fromTick');
  assertNonNegativeInteger(input.toTick, 'toTick');
  if (input.toTick < input.fromTick) throw new TypeError('toTick must be >= fromTick');
  assertSafeRef(input.reasonRef, 'reasonRef');
  if (input.consentRefOrNull !== null) assertSafeRef(input.consentRefOrNull, 'consentRefOrNull');
  assertPrivacy(input.privacyClass, 'privacyClass');
  assertRetention(input.retentionClass, 'retentionClass');
  if (input.retentionClass === 'EPHEMERAL_HOT_TAIL') throw new TypeError('a promoted window requires durable session/event/saved retention');
  assertUniqueSafeRefs(input.eventRefs, 'eventRefs', { allowEmpty: false });
  if (input.privacyClass !== 'PARTICIPANT_PRIVATE' && input.consentRefOrNull === null) {
    throw new TypeError('shared/public promoted motion requires an explicit consentRef');
  }
  const samples = tail.samples
    .filter((sample) => sample.tick >= input.fromTick && sample.tick <= input.toTick)
    .map(canonicalClone);
  if (!samples.length) throw new TypeError('promoted motion window contains no retained samples');
  const body = {
    schemaVersion: MOTION_WINDOW_SCHEMA,
    windowRef: input.windowRef,
    sourceTailRef: tail.tailRef,
    participantRef: tail.participantRef,
    coordinateSpaceRef: tail.coordinateSpaceRef,
    quantizationProfileRef: tail.quantizationProfileRef,
    fromTick: input.fromTick,
    toTick: input.toTick,
    reasonRef: input.reasonRef,
    consentRefOrNull: input.consentRefOrNull,
    privacyClass: input.privacyClass,
    retentionClass: input.retentionClass,
    eventRefs: [...input.eventRefs],
    sampleCount: samples.length,
    samples
  };
  return frozenCanonical({ ...body, motionWindowSha256: hashCanonical(body) });
}

export function verifyMotionWindow(window) {
  assertExactKeys(window, [
    'schemaVersion', 'windowRef', 'sourceTailRef', 'participantRef', 'coordinateSpaceRef',
    'quantizationProfileRef', 'fromTick', 'toTick', 'reasonRef', 'consentRefOrNull',
    'privacyClass', 'retentionClass', 'eventRefs', 'sampleCount', 'samples',
    'motionWindowSha256'
  ], 'motion window');
  if (window.schemaVersion !== MOTION_WINDOW_SCHEMA) throw new TypeError('motion window schema mismatch');
  assertSafeRef(window.windowRef, 'motion window windowRef');
  assertSafeRef(window.sourceTailRef, 'motion window sourceTailRef');
  assertSafeRef(window.participantRef, 'motion window participantRef');
  assertSafeRef(window.coordinateSpaceRef, 'motion window coordinateSpaceRef');
  if (window.quantizationProfileRef !== MOTION_QUANTIZATION_PROFILE) {
    throw new TypeError('motion window quantization profile mismatch');
  }
  assertNonNegativeInteger(window.fromTick, 'motion window fromTick');
  assertNonNegativeInteger(window.toTick, 'motion window toTick');
  if (window.toTick < window.fromTick) throw new TypeError('motion window toTick must be >= fromTick');
  assertSafeRef(window.reasonRef, 'motion window reasonRef');
  if (window.consentRefOrNull !== null) assertSafeRef(window.consentRefOrNull, 'motion window consentRefOrNull');
  assertPrivacy(window.privacyClass, 'motion window privacyClass');
  assertRetention(window.retentionClass, 'motion window retentionClass');
  if (window.retentionClass === 'EPHEMERAL_HOT_TAIL') throw new TypeError('promoted motion window cannot remain ephemeral');
  if (window.privacyClass !== 'PARTICIPANT_PRIVATE' && window.consentRefOrNull === null) {
    throw new TypeError('shared/public promoted motion requires an explicit consentRef');
  }
  assertUniqueSafeRefs(window.eventRefs, 'motion window eventRefs', { allowEmpty: false });
  assertPositiveInteger(window.sampleCount, 'motion window sampleCount');
  if (!Array.isArray(window.samples) || window.samples.length !== window.sampleCount) {
    throw new TypeError('motion window sample count mismatch');
  }

  const owner = {
    tailRef: window.sourceTailRef,
    participantRef: window.participantRef,
    coordinateSpaceRef: window.coordinateSpaceRef
  };
  let priorSequence = -1;
  let priorTick = -1;
  for (const sample of window.samples) {
    validateMotionSample(sample, owner);
    if (sample.sequence <= priorSequence || sample.tick < priorTick) {
      throw new TypeError('motion window sample order invalid');
    }
    if (sample.tick < window.fromTick || sample.tick > window.toTick) {
      throw new TypeError('motion window contains sample outside selected interval');
    }
    priorSequence = sample.sequence;
    priorTick = sample.tick;
  }

  assertSha256(window.motionWindowSha256, 'motionWindowSha256');
  rejectHiddenReasoning(window, 'motion window');
  const { motionWindowSha256, ...body } = window;
  if (hashCanonical(body) !== motionWindowSha256) throw new TypeError('motion window digest mismatch');
  return window;
}
