import {
  ZERO_SHA256,
  assertExactKeys,
  assertFiniteNumber,
  assertNonNegativeInteger,
  assertPlainObject,
  assertSafeRef,
  assertSha256,
  assertUniqueSafeRefs,
  canonicalClone,
  frozenCanonical,
  hashCanonical,
  rejectHiddenReasoning
} from './canonical.mjs';

export const SCHEMA = Object.freeze({
  epoch: 'vexworld.determinism-epoch/v1',
  frame: 'vexworld.world-input-frame/v1',
  event: 'vexworld.chronicle-event/v1',
  chronicle: 'vexworld.chronicle/v1',
  snapshot: 'vexworld.world-snapshot/v1',
  branch: 'vexworld.worldline-branch/v1',
  decision: 'vexworld.intelligence-decision/v1',
  replay: 'vexworld.worldline-replay-receipt/v1'
});

export const FIGHT_EVENT_CLASSES = Object.freeze([
  'OBSERVATION_DELIVERED', 'INTENT_ACCEPTED', 'ACTION_STARTED',
  'HIT_RESOLVED', 'ENVIRONMENT_FRACTURED', 'DESTRUCTION_SETTLED',
  'MOTION_WINDOW_PROMOTED'
]);

const PRIVACY = new Set([
  'PUBLIC_WORLD', 'PARTY_SHARED', 'PARTICIPANT_PRIVATE',
  'SYSTEM_PROOF', 'EXTERNAL_EFFECT_PROTECTED', 'EPHEMERAL_PRESENTATION'
]);
const BRANCH_CLASS = new Set([
  'VERIFIED_CANONICAL', 'NETWORK_PREDICTION', 'PRIVATE_REHEARSAL',
  'SHARED_ALTERNATE_HISTORY', 'TRAJECTORY_FORECAST',
  'MEDIA_RECONSTRUCTION', 'TEST_FIXTURE'
]);
const FIGHT = new Set(FIGHT_EVENT_CLASSES);
const pad = (n, width) => String(n).padStart(width, '0');

function boundedText(value, label, max = 160) {
  if (typeof value !== 'string' || !value.trim() || value.length > max || /[\u0000-\u001f\u007f]/u.test(value)) {
    throw new TypeError(`${label} must be bounded printable text`);
  }
  return value;
}

function plainArray(value, label) {
  if (!Array.isArray(value)) throw new TypeError(`${label} must be an array`);
  value.forEach((item, index) => {
    assertPlainObject(item, `${label}[${index}]`);
    rejectHiddenReasoning(item, `${label}[${index}]`);
  });
  return value;
}

function rngState(value) {
  assertPlainObject(value, 'rngStateByStream');
  for (const [ref, state] of Object.entries(value)) {
    assertSafeRef(ref, 'rng stream ref');
    assertNonNegativeInteger(state, `rngStateByStream.${ref}`);
  }
  return value;
}

export function formDeterminismEpoch(input) {
  assertExactKeys(input, [
    'epochRef', 'worldPackageFingerprint', 'kernelRef', 'kernelSha256',
    'stateSchemaVersion', 'fixedStepMs', 'numericProfileRef', 'rootSeed',
    'rngStreamRefs'
  ], 'epoch input');
  assertSafeRef(input.epochRef, 'epochRef');
  assertSha256(input.worldPackageFingerprint, 'worldPackageFingerprint');
  assertSafeRef(input.kernelRef, 'kernelRef');
  assertSha256(input.kernelSha256, 'kernelSha256');
  boundedText(input.stateSchemaVersion, 'stateSchemaVersion');
  assertFiniteNumber(input.fixedStepMs, 'fixedStepMs');
  if (input.fixedStepMs <= 0 || input.fixedStepMs > 1000) throw new TypeError('fixedStepMs out of range');
  assertSafeRef(input.numericProfileRef, 'numericProfileRef');
  assertNonNegativeInteger(input.rootSeed, 'rootSeed');
  assertUniqueSafeRefs(input.rngStreamRefs, 'rngStreamRefs');
  const body = { schemaVersion: SCHEMA.epoch, ...canonicalClone(input) };
  return frozenCanonical({ ...body, epochSha256: hashCanonical(body) });
}

export function validateDeterminismEpoch(epoch) {
  assertPlainObject(epoch, 'epoch');
  const rebuilt = formDeterminismEpoch(Object.fromEntries(
    Object.entries(epoch).filter(([key]) => !['schemaVersion', 'epochSha256'].includes(key))
  ));
  if (epoch.schemaVersion !== SCHEMA.epoch || rebuilt.epochSha256 !== epoch.epochSha256) {
    throw new TypeError('invalid determinism epoch');
  }
  return epoch;
}

export function formWorldInputFrame(input) {
  assertExactKeys(input, [
    'branchRef', 'tick', 'humanActionIntents', 'companionIntents',
    'scheduledWorldEvents', 'motionWindowRefs', 'rngStateByStream'
  ], 'input frame');
  assertSafeRef(input.branchRef, 'branchRef');
  assertNonNegativeInteger(input.tick, 'tick');
  plainArray(input.humanActionIntents, 'humanActionIntents');
  plainArray(input.companionIntents, 'companionIntents');
  plainArray(input.scheduledWorldEvents, 'scheduledWorldEvents');
  assertUniqueSafeRefs(input.motionWindowRefs, 'motionWindowRefs');
  rngState(input.rngStateByStream);
  rejectHiddenReasoning(input, 'input frame');
  const body = { schemaVersion: SCHEMA.frame, ...canonicalClone(input) };
  return frozenCanonical({ ...body, inputFrameSha256: hashCanonical(body) });
}

export function validateWorldInputFrame(frame) {
  assertPlainObject(frame, 'frame');
  const rebuilt = formWorldInputFrame(Object.fromEntries(
    Object.entries(frame).filter(([key]) => !['schemaVersion', 'inputFrameSha256'].includes(key))
  ));
  if (frame.schemaVersion !== SCHEMA.frame || rebuilt.inputFrameSha256 !== frame.inputFrameSha256) {
    throw new TypeError('invalid world input frame');
  }
  return frame;
}

export function createChronicle({ timelineRef, branchRef, epoch, baseEventHeadSha256 = ZERO_SHA256, baseTick = 0 }) {
  assertSafeRef(timelineRef, 'timelineRef');
  assertSafeRef(branchRef, 'branchRef');
  validateDeterminismEpoch(epoch);
  assertSha256(baseEventHeadSha256, 'baseEventHeadSha256');
  assertNonNegativeInteger(baseTick, 'baseTick');
  return frozenCanonical({
    schemaVersion: SCHEMA.chronicle, timelineRef, branchRef,
    epoch: canonicalClone(epoch), baseEventHeadSha256, baseTick,
    events: [], headSha256: baseEventHeadSha256,
    lastTick: baseTick, lastOrdinal: -1
  });
}

function eventRef(branchRef, tick, ordinal) {
  return `${branchRef}.event.${pad(tick, 12)}.${pad(ordinal, 6)}`;
}

export function appendChronicleEvent(chronicle, input) {
  verifyChronicle(chronicle);
  assertExactKeys(input, [
    'tick', 'ordinal', 'actorRef', 'eventClass', 'privacyClass',
    'causationRefs', 'correlationRefOrNull', 'payload'
  ], 'event input');
  assertNonNegativeInteger(input.tick, 'event.tick');
  assertNonNegativeInteger(input.ordinal, 'event.ordinal');
  assertSafeRef(input.actorRef, 'event.actorRef');
  assertSafeRef(input.eventClass, 'event.eventClass');
  if (!PRIVACY.has(input.privacyClass)) throw new TypeError('unsupported privacy class');
  assertUniqueSafeRefs(input.causationRefs, 'event.causationRefs');
  if (input.correlationRefOrNull !== null) assertSafeRef(input.correlationRefOrNull, 'correlationRefOrNull');
  assertPlainObject(input.payload, 'event.payload');
  rejectHiddenReasoning(input.payload, 'event.payload');
  if (input.tick < chronicle.lastTick) throw new TypeError('event tick moved backward');
  if (input.tick === chronicle.lastTick && input.ordinal !== chronicle.lastOrdinal + 1) throw new TypeError('event ordinal is not contiguous');
  if (input.tick > chronicle.lastTick && input.ordinal !== 0) throw new TypeError('new tick must begin at ordinal 0');

  const payload = canonicalClone(input.payload);
  const body = {
    schemaVersion: SCHEMA.event,
    eventRef: eventRef(chronicle.branchRef, input.tick, input.ordinal),
    timelineRef: chronicle.timelineRef,
    branchRef: chronicle.branchRef,
    tick: input.tick,
    ordinal: input.ordinal,
    simulationTimeMs: Number((input.tick * chronicle.epoch.fixedStepMs).toFixed(9)),
    actorRef: input.actorRef,
    eventClass: input.eventClass,
    privacyClass: input.privacyClass,
    causationRefs: [...input.causationRefs],
    correlationRefOrNull: input.correlationRefOrNull,
    determinismEpochRef: chronicle.epoch.epochRef,
    determinismEpochSha256: chronicle.epoch.epochSha256,
    payload,
    payloadSha256: hashCanonical(payload),
    priorEventSha256: chronicle.headSha256
  };
  const event = frozenCanonical({ ...body, eventSha256: hashCanonical(body) });
  const nextChronicle = frozenCanonical({
    ...canonicalClone(chronicle), events: [...chronicle.events, event],
    headSha256: event.eventSha256, lastTick: event.tick, lastOrdinal: event.ordinal
  });
  return Object.freeze({ chronicle: nextChronicle, event });
}

export function appendFightChronologyEvent(chronicle, input) {
  if (!FIGHT.has(input?.eventClass)) throw new TypeError('unsupported fight chronology event');
  return appendChronicleEvent(chronicle, input);
}

export function verifyChronicle(chronicle) {
  assertPlainObject(chronicle, 'chronicle');
  if (chronicle.schemaVersion !== SCHEMA.chronicle) throw new TypeError('chronicle schema mismatch');
  validateDeterminismEpoch(chronicle.epoch);
  let prior = chronicle.baseEventHeadSha256;
  let tick = chronicle.baseTick;
  let ordinal = -1;
  for (const event of chronicle.events) {
    if (event.schemaVersion !== SCHEMA.event) throw new TypeError('event schema mismatch');
    if (event.timelineRef !== chronicle.timelineRef || event.branchRef !== chronicle.branchRef) throw new TypeError('event owner mismatch');
    if (event.priorEventSha256 !== prior) throw new TypeError('event prior hash mismatch');
    if (hashCanonical(event.payload) !== event.payloadSha256) throw new TypeError('event payload digest mismatch');
    const { eventSha256, ...body } = event;
    if (hashCanonical(body) !== eventSha256) throw new TypeError('event hash mismatch');
    if (event.tick < tick || (event.tick === tick && event.ordinal !== ordinal + 1) || (event.tick > tick && event.ordinal !== 0)) {
      throw new TypeError('event order mismatch');
    }
    prior = eventSha256;
    tick = event.tick;
    ordinal = event.ordinal;
  }
  if (prior !== chronicle.headSha256 || tick !== chronicle.lastTick || ordinal !== chronicle.lastOrdinal) {
    throw new TypeError('chronicle terminal coordinate mismatch');
  }
  return chronicle;
}

export function sealWorldSnapshot({ chronicle, tick, canonicalState }) {
  verifyChronicle(chronicle);
  assertNonNegativeInteger(tick, 'snapshot.tick');
  if (tick !== chronicle.lastTick) throw new TypeError('snapshot tick is not Chronicle head');
  assertPlainObject(canonicalState, 'canonicalState');
  rejectHiddenReasoning(canonicalState, 'canonicalState');
  const state = canonicalClone(canonicalState);
  const body = {
    schemaVersion: SCHEMA.snapshot,
    snapshotRef: `${chronicle.branchRef}.snapshot.${pad(tick, 12)}.${hashCanonical(state).slice(0, 12)}`,
    timelineRef: chronicle.timelineRef,
    branchRef: chronicle.branchRef,
    tick,
    determinismEpochRef: chronicle.epoch.epochRef,
    determinismEpochSha256: chronicle.epoch.epochSha256,
    worldPackageFingerprint: chronicle.epoch.worldPackageFingerprint,
    eventCount: chronicle.events.length,
    eventHeadSha256: chronicle.headSha256,
    canonicalState: state,
    canonicalStateSha256: hashCanonical(state)
  };
  return frozenCanonical({ ...body, snapshotSha256: hashCanonical(body) });
}

export function verifyWorldSnapshot(snapshot, { epoch = null } = {}) {
  assertPlainObject(snapshot, 'snapshot');
  if (snapshot.schemaVersion !== SCHEMA.snapshot) throw new TypeError('snapshot schema mismatch');
  const { snapshotSha256, ...body } = snapshot;
  if (hashCanonical(body) !== snapshotSha256 || hashCanonical(snapshot.canonicalState) !== snapshot.canonicalStateSha256) {
    throw new TypeError('snapshot digest mismatch');
  }
  if (epoch) {
    validateDeterminismEpoch(epoch);
    if (snapshot.determinismEpochSha256 !== epoch.epochSha256 || snapshot.worldPackageFingerprint !== epoch.worldPackageFingerprint) {
      throw new TypeError('snapshot epoch mismatch');
    }
  }
  return snapshot;
}

export function forkWorldline({ parentChronicle, snapshot, branchRef, branchClass, formedByRef, purposeRef, assumptionRefs = [] }) {
  verifyChronicle(parentChronicle);
  verifyWorldSnapshot(snapshot, { epoch: parentChronicle.epoch });
  assertSafeRef(branchRef, 'branchRef');
  if (branchRef === parentChronicle.branchRef) throw new TypeError('fork must have a fresh branchRef');
  if (!BRANCH_CLASS.has(branchClass)) throw new TypeError('unsupported branch class');
  assertSafeRef(formedByRef, 'formedByRef');
  assertSafeRef(purposeRef, 'purposeRef');
  assertUniqueSafeRefs(assumptionRefs, 'assumptionRefs');
  if (snapshot.branchRef !== parentChronicle.branchRef || snapshot.eventHeadSha256 !== parentChronicle.headSha256) {
    throw new TypeError('fork snapshot does not bind current parent head');
  }
  const body = {
    schemaVersion: SCHEMA.branch, branchRef, branchClass,
    timelineRef: parentChronicle.timelineRef,
    parentBranchRef: parentChronicle.branchRef,
    forkTick: snapshot.tick,
    baseSnapshotRef: snapshot.snapshotRef,
    baseSnapshotSha256: snapshot.snapshotSha256,
    baseEventHeadSha256: snapshot.eventHeadSha256,
    determinismEpochRef: parentChronicle.epoch.epochRef,
    determinismEpochSha256: parentChronicle.epoch.epochSha256,
    formedByRef, purposeRef, assumptionRefs: [...assumptionRefs], lifecycleState: 'ACTIVE'
  };
  return Object.freeze({
    branch: frozenCanonical({ ...body, branchSha256: hashCanonical(body) }),
    chronicle: createChronicle({
      timelineRef: parentChronicle.timelineRef,
      branchRef,
      epoch: parentChronicle.epoch,
      baseEventHeadSha256: snapshot.eventHeadSha256,
      baseTick: snapshot.tick
    })
  });
}

export function formIntelligenceDecision(input) {
  assertExactKeys(input, [
    'participantRef', 'workerRef', 'sourceObservationRef', 'sourceObservationSha256',
    'visibleContextRefs', 'controllerRef', 'modelIdentityOrNull', 'proposedIntent',
    'acceptedIntentOrNull', 'rejectionReasonOrNull', 'conciseReasonOrNull'
  ], 'decision input');
  rejectHiddenReasoning(input, 'decision');
  for (const [key, value] of [
    ['participantRef', input.participantRef], ['workerRef', input.workerRef],
    ['sourceObservationRef', input.sourceObservationRef], ['controllerRef', input.controllerRef]
  ]) assertSafeRef(value, key);
  assertSha256(input.sourceObservationSha256, 'sourceObservationSha256');
  assertUniqueSafeRefs(input.visibleContextRefs, 'visibleContextRefs');
  if (input.modelIdentityOrNull !== null) {
    assertExactKeys(input.modelIdentityOrNull, ['modelRef', 'modelDigest'], 'modelIdentityOrNull');
    assertSafeRef(input.modelIdentityOrNull.modelRef, 'modelRef');
    assertSha256(input.modelIdentityOrNull.modelDigest, 'modelDigest');
  }
  assertPlainObject(input.proposedIntent, 'proposedIntent');
  if (input.acceptedIntentOrNull !== null) assertPlainObject(input.acceptedIntentOrNull, 'acceptedIntentOrNull');
  if (input.rejectionReasonOrNull !== null) assertSafeRef(input.rejectionReasonOrNull, 'rejectionReasonOrNull');
  if (input.conciseReasonOrNull !== null) boundedText(input.conciseReasonOrNull, 'conciseReasonOrNull', 240);
  const body = { schemaVersion: SCHEMA.decision, ...canonicalClone(input) };
  return frozenCanonical({ ...body, decisionSha256: hashCanonical(body) });
}

export function replayWorldline({ snapshot, epoch, targetBranchRef, inputFrames, reducer, expectedStateSha256OrNull = null }) {
  verifyWorldSnapshot(snapshot, { epoch });
  assertSafeRef(targetBranchRef, 'targetBranchRef');
  if (!Array.isArray(inputFrames) || typeof reducer !== 'function') throw new TypeError('replay requires inputFrames and reducer');
  if (expectedStateSha256OrNull !== null) assertSha256(expectedStateSha256OrNull, 'expectedStateSha256OrNull');
  let state = canonicalClone(snapshot.canonicalState);
  let expectedTick = snapshot.tick + 1;
  const frameHashes = [];
  for (const frame of inputFrames) {
    validateWorldInputFrame(frame);
    if (frame.branchRef !== targetBranchRef || frame.tick !== expectedTick) throw new TypeError('replay frame coordinate mismatch');
    const next = reducer(canonicalClone(state), frozenCanonical(frame), epoch);
    assertPlainObject(next, 'reducer result');
    rejectHiddenReasoning(next, 'reducer result');
    state = canonicalClone(next);
    frameHashes.push(frame.inputFrameSha256);
    expectedTick += 1;
  }
  const finalStateSha256 = hashCanonical(state);
  if (expectedStateSha256OrNull !== null && finalStateSha256 !== expectedStateSha256OrNull) throw new TypeError('replay state hash mismatch');
  const body = {
    schemaVersion: SCHEMA.replay,
    sourceSnapshotRef: snapshot.snapshotRef,
    sourceSnapshotSha256: snapshot.snapshotSha256,
    targetBranchRef,
    determinismEpochRef: epoch.epochRef,
    determinismEpochSha256: epoch.epochSha256,
    startTick: snapshot.tick,
    finalTick: expectedTick - 1,
    frameCount: inputFrames.length,
    frameHashes,
    finalState: state,
    finalStateSha256,
    inputMode: 'RECORDED_INPUT_FRAMES_ONLY'
  };
  return frozenCanonical({ ...body, replayReceiptSha256: hashCanonical(body) });
}
