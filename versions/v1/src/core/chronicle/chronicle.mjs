import { createContext, Script } from 'node:vm';
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
  canonicalJson,
  frozenCanonical,
  hashCanonical,
  rejectHiddenReasoning,
  sha256Hex
} from './canonical.mjs';

export const SCHEMA = Object.freeze({
  epoch: 'vexworld.determinism-epoch/v1',
  frame: 'vexworld.world-input-frame/v1',
  event: 'vexworld.chronicle-event/v1',
  chronicle: 'vexworld.chronicle/v1',
  snapshot: 'vexworld.world-snapshot/v1',
  branch: 'vexworld.worldline-branch/v1',
  decision: 'vexworld.intelligence-decision/v1',
  replay: 'vexworld.worldline-replay-receipt/v1',
  verifiedHead: 'vexworld.verified-head/v1',
  predictedHead: 'vexworld.predicted-head/v1',
  predictionComparison: 'vexworld.prediction-comparison/v1',
  rollback: 'vexworld.rollback-receipt/v1',
  resync: 'vexworld.authoritative-resync-receipt/v1'
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

function validateNullableSafeRef(value, label) {
  if (value !== null) assertSafeRef(value, label);
  return value;
}

function boundedDecisionReason(value, label, max = 180) {
  if (typeof value !== 'string' || !value.trim() || value.length > max) {
    throw new TypeError(`${label} must be bounded non-empty text`);
  }
  return value;
}

function validateDecisionProposedIntent(value) {
  assertPlainObject(value, 'proposedIntent');
  rejectHiddenReasoning(value, 'proposedIntent');
  assertExactKeys(value, ['intentType', 'targetRef', 'reason'], 'proposedIntent');
  assertSafeRef(value.intentType, 'proposedIntent.intentType');
  validateNullableSafeRef(value.targetRef, 'proposedIntent.targetRef');
  boundedDecisionReason(value.reason, 'proposedIntent.reason', 180);
  return value;
}

function validateDecisionAcceptedIntent(value) {
  assertPlainObject(value, 'acceptedIntentOrNull');
  rejectHiddenReasoning(value, 'acceptedIntentOrNull');
  assertExactKeys(value, ['intentRef', 'intentType', 'targetRef'], 'acceptedIntentOrNull');
  assertSafeRef(value.intentRef, 'acceptedIntentOrNull.intentRef');
  assertSafeRef(value.intentType, 'acceptedIntentOrNull.intentType');
  validateNullableSafeRef(value.targetRef, 'acceptedIntentOrNull.targetRef');
  return value;
}

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

const REDUCER_SOURCE_LIMIT = 65536;
const REDUCER_VM_TIMEOUT_MS = 100;
const REDUCER_VM_FILENAME = 'vexworld-chronicle-reducer.vm';

function normalizeReducerSource(reducerSource) {
  if (typeof reducerSource !== 'string') throw new TypeError('execution kernel reducerSource must be a string');
  const source = reducerSource.trim();
  if (!source || source.length > REDUCER_SOURCE_LIMIT || /[\u0000\u000b\u000c\u007f]/u.test(source)) {
    throw new TypeError('execution kernel reducerSource must be bounded text');
  }
  if (source.includes('[native code]')) {
    throw new TypeError('native/bound reducer source is not admitted');
  }
  try {
    new Script(`(${source}\n)`, { filename: REDUCER_VM_FILENAME });
  } catch (error) {
    throw new TypeError(`execution kernel reducerSource is not a valid reducer: ${error.message}`);
  }
  return source;
}

function compileReducerInvocation(reducerSource) {
  const source = normalizeReducerSource(reducerSource);
  const invocationSource = `(() => {
    "use strict";

    globalThis.Date = undefined;
    globalThis.Intl = undefined;
    globalThis.WeakRef = undefined;
    globalThis.FinalizationRegistry = undefined;
    globalThis.Atomics = undefined;
    globalThis.SharedArrayBuffer = undefined;
    globalThis.WebAssembly = undefined;
    globalThis.process = undefined;
    globalThis.require = undefined;
    globalThis.module = undefined;
    globalThis.fetch = undefined;
    globalThis.performance = undefined;
    globalThis.crypto = undefined;
    globalThis.setTimeout = undefined;
    globalThis.setInterval = undefined;
    globalThis.setImmediate = undefined;
    globalThis.queueMicrotask = undefined;

    function deterministicErrorStack(error) {
      const name = typeof error.name === 'string' && error.name ? error.name : 'Error';
      const message = typeof error.message === 'string' ? error.message : '';
      return message ? name + ': ' + message : name;
    }

    Object.defineProperty(Error, 'stackTraceLimit', {
      value: 0,
      configurable: false,
      writable: false
    });
    Object.defineProperty(Error, 'prepareStackTrace', {
      value: deterministicErrorStack,
      configurable: false,
      writable: false
    });

    Object.defineProperty(Math, 'random', {
      value() {
        throw new TypeError('hidden random source is not admitted');
      },
      configurable: false,
      writable: false
    });

    const parseJson = JSON.parse;
    const stringifyJson = JSON.stringify;
    const objectKeys = Object.keys;
    const getPrototypeOf = Object.getPrototypeOf;
    const isArray = Array.isArray;
    const isFiniteNumber = Number.isFinite;
    const isNegativeZero = Object.is;

    function canonicalizeResult(value, path = '$') {
      if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
      if (typeof value === 'number') {
        if (!isFiniteNumber(value)) throw new TypeError(path + ' contains a non-finite number');
        return isNegativeZero(value, -0) ? 0 : value;
      }
      if (isArray(value)) {
        const output = [];
        for (let index = 0; index < value.length; index += 1) {
          output[index] = canonicalizeResult(value[index], path + '[' + index + ']');
        }
        return output;
      }
      if (typeof value !== 'object') throw new TypeError(path + ' contains a non-canonical value');
      const prototype = getPrototypeOf(value);
      if (prototype !== Object.prototype && prototype !== null) {
        throw new TypeError(path + ' contains a non-canonical object');
      }
      const output = {};
      const keys = objectKeys(value).sort();
      for (let index = 0; index < keys.length; index += 1) {
        const key = keys[index];
        output[key] = canonicalizeResult(value[key], path + '.' + key);
      }
      return output;
    }

    const reducer = (${source});
    if (typeof reducer !== 'function') {
      throw new TypeError('execution kernel reducerSource must evaluate to a function');
    }

    const state = parseJson(__vexStateJson);
    const frame = parseJson(__vexFrameJson);
    const epoch = parseJson(__vexEpochJson);
    const bindings = parseJson(__vexBindingsJson);
    const result = reducer(state, frame, epoch, bindings);
    return stringifyJson(canonicalizeResult(result));
  })()`;

  try {
    return Object.freeze({
      reducerSource: source,
      script: new Script(invocationSource, { filename: REDUCER_VM_FILENAME })
    });
  } catch (error) {
    throw new TypeError(`execution kernel reducerSource cannot be compiled for isolated replay: ${error.message}`);
  }
}

function executeReducerInIsolatedContext(compiledScript, { state, frame, epoch, bindings }) {
  const sandbox = Object.create(null);
  sandbox.__vexStateJson = canonicalJson(state);
  sandbox.__vexFrameJson = canonicalJson(frame);
  sandbox.__vexEpochJson = canonicalJson(epoch);
  sandbox.__vexBindingsJson = canonicalJson(bindings);

  const context = createContext(sandbox, {
    name: 'vexworld-chronicle-reducer',
    codeGeneration: { strings: false, wasm: false }
  });

  let resultJson;
  try {
    resultJson = compiledScript.runInContext(context, {
      timeout: REDUCER_VM_TIMEOUT_MS,
      displayErrors: true
    });
  } catch (error) {
    throw new TypeError(`execution kernel reducer failed in isolated replay: ${error.message}`);
  }

  if (typeof resultJson !== 'string') {
    throw new TypeError('execution kernel reducer did not return canonical JSON');
  }

  let result;
  try {
    result = JSON.parse(resultJson);
  } catch (error) {
    throw new TypeError(`execution kernel reducer returned invalid JSON: ${error.message}`);
  }
  assertPlainObject(result, 'reducer result');
  rejectHiddenReasoning(result, 'reducer result');
  return result;
}

function executionKernelSha256(kernelRef, reducerSource, bindings) {
  return hashCanonical({ kernelRef, reducerSource, bindings });
}

export function bindExecutionKernel(input) {
  assertExactKeys(input, ['kernelRef', 'reducerSource', 'bindings'], 'execution kernel input');
  assertSafeRef(input.kernelRef, 'execution kernel.kernelRef');
  assertPlainObject(input.bindings, 'execution kernel.bindings');
  rejectHiddenReasoning(input.bindings, 'execution kernel.bindings');

  const reducerSource = normalizeReducerSource(input.reducerSource);
  const bindings = canonicalClone(input.bindings);
  const kernelSha256 = executionKernelSha256(input.kernelRef, reducerSource, bindings);
  return frozenCanonical({
    kernelRef: input.kernelRef,
    kernelSha256,
    reducerSource,
    bindings
  });
}

function validateExecutionKernel(executionKernel, epoch) {
  assertPlainObject(executionKernel, 'execution kernel');
  assertExactKeys(executionKernel, ['kernelRef', 'kernelSha256', 'reducerSource', 'bindings'], 'execution kernel');
  assertSafeRef(executionKernel.kernelRef, 'execution kernel.kernelRef');
  assertSha256(executionKernel.kernelSha256, 'execution kernel.kernelSha256');
  assertPlainObject(executionKernel.bindings, 'execution kernel.bindings');
  rejectHiddenReasoning(executionKernel.bindings, 'execution kernel.bindings');

  const compiled = compileReducerInvocation(executionKernel.reducerSource);
  const bindings = canonicalClone(executionKernel.bindings);
  const actualKernelSha256 = executionKernelSha256(executionKernel.kernelRef, compiled.reducerSource, bindings);
  if (actualKernelSha256 !== executionKernel.kernelSha256) {
    throw new TypeError('execution kernel descriptor digest mismatch');
  }
  if (
    executionKernel.kernelRef !== epoch.kernelRef ||
    executionKernel.kernelSha256 !== epoch.kernelSha256
  ) {
    throw new TypeError('execution kernel does not match determinism epoch');
  }
  return Object.freeze({
    kernelRef: executionKernel.kernelRef,
    kernelSha256: executionKernel.kernelSha256,
    reducerSource: compiled.reducerSource,
    bindings: frozenCanonical(bindings),
    script: compiled.script
  });
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

function validateChronicleEvent(event, chronicle, { priorSha256, priorTick, priorOrdinal }) {
  assertExactKeys(event, [
    'schemaVersion', 'eventRef', 'timelineRef', 'branchRef', 'tick', 'ordinal',
    'simulationTimeMs', 'actorRef', 'eventClass', 'privacyClass', 'causationRefs',
    'correlationRefOrNull', 'determinismEpochRef', 'determinismEpochSha256',
    'payload', 'payloadSha256', 'priorEventSha256', 'eventSha256'
  ], 'Chronicle event');

  if (event.schemaVersion !== SCHEMA.event) throw new TypeError('event schema mismatch');
  assertSafeRef(event.eventRef, 'event.eventRef');
  assertSafeRef(event.timelineRef, 'event.timelineRef');
  assertSafeRef(event.branchRef, 'event.branchRef');
  assertNonNegativeInteger(event.tick, 'event.tick');
  assertNonNegativeInteger(event.ordinal, 'event.ordinal');
  assertFiniteNumber(event.simulationTimeMs, 'event.simulationTimeMs');
  assertSafeRef(event.actorRef, 'event.actorRef');
  assertSafeRef(event.eventClass, 'event.eventClass');
  if (!PRIVACY.has(event.privacyClass)) throw new TypeError('unsupported privacy class');
  assertUniqueSafeRefs(event.causationRefs, 'event.causationRefs');
  if (event.correlationRefOrNull !== null) assertSafeRef(event.correlationRefOrNull, 'event.correlationRefOrNull');
  assertSafeRef(event.determinismEpochRef, 'event.determinismEpochRef');
  assertSha256(event.determinismEpochSha256, 'event.determinismEpochSha256');
  assertPlainObject(event.payload, 'event.payload');
  rejectHiddenReasoning(event.payload, 'event.payload');
  assertSha256(event.payloadSha256, 'event.payloadSha256');
  assertSha256(event.priorEventSha256, 'event.priorEventSha256');
  assertSha256(event.eventSha256, 'event.eventSha256');

  if (event.timelineRef !== chronicle.timelineRef || event.branchRef !== chronicle.branchRef) {
    throw new TypeError('event owner mismatch');
  }
  if (event.eventRef !== eventRef(chronicle.branchRef, event.tick, event.ordinal)) {
    throw new TypeError('event coordinate ref mismatch');
  }
  const expectedSimulationTimeMs = Number((event.tick * chronicle.epoch.fixedStepMs).toFixed(9));
  if (event.simulationTimeMs !== expectedSimulationTimeMs) {
    throw new TypeError('event simulation time mismatch');
  }
  if (
    event.determinismEpochRef !== chronicle.epoch.epochRef ||
    event.determinismEpochSha256 !== chronicle.epoch.epochSha256
  ) {
    throw new TypeError('event determinism epoch mismatch');
  }
  if (event.priorEventSha256 !== priorSha256) throw new TypeError('event prior hash mismatch');
  if (hashCanonical(event.payload) !== event.payloadSha256) throw new TypeError('event payload digest mismatch');

  const { eventSha256, ...body } = event;
  if (hashCanonical(body) !== eventSha256) throw new TypeError('event hash mismatch');

  if (
    event.tick < priorTick ||
    (event.tick === priorTick && event.ordinal !== priorOrdinal + 1) ||
    (event.tick > priorTick && event.ordinal !== 0)
  ) {
    throw new TypeError('event order mismatch');
  }
  return event;
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
  assertExactKeys(chronicle, [
    'schemaVersion', 'timelineRef', 'branchRef', 'epoch', 'baseEventHeadSha256',
    'baseTick', 'events', 'headSha256', 'lastTick', 'lastOrdinal'
  ], 'chronicle');
  if (chronicle.schemaVersion !== SCHEMA.chronicle) throw new TypeError('chronicle schema mismatch');
  assertSafeRef(chronicle.timelineRef, 'chronicle.timelineRef');
  assertSafeRef(chronicle.branchRef, 'chronicle.branchRef');
  validateDeterminismEpoch(chronicle.epoch);
  assertSha256(chronicle.baseEventHeadSha256, 'chronicle.baseEventHeadSha256');
  assertNonNegativeInteger(chronicle.baseTick, 'chronicle.baseTick');
  if (!Array.isArray(chronicle.events)) throw new TypeError('chronicle.events must be an array');
  assertSha256(chronicle.headSha256, 'chronicle.headSha256');
  assertNonNegativeInteger(chronicle.lastTick, 'chronicle.lastTick');
  if (!Number.isSafeInteger(chronicle.lastOrdinal) || chronicle.lastOrdinal < -1) {
    throw new TypeError('chronicle.lastOrdinal must be a safe integer >= -1');
  }

  let prior = chronicle.baseEventHeadSha256;
  let tick = chronicle.baseTick;
  let ordinal = -1;
  for (const event of chronicle.events) {
    validateChronicleEvent(event, chronicle, {
      priorSha256: prior,
      priorTick: tick,
      priorOrdinal: ordinal
    });
    prior = event.eventSha256;
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

export function verifyWorldSnapshot(snapshot, { epoch = null, chronicle = null } = {}) {
  assertExactKeys(snapshot, [
    'schemaVersion', 'snapshotRef', 'timelineRef', 'branchRef', 'tick',
    'determinismEpochRef', 'determinismEpochSha256', 'worldPackageFingerprint',
    'eventCount', 'eventHeadSha256', 'canonicalState', 'canonicalStateSha256',
    'snapshotSha256'
  ], 'snapshot');
  if (snapshot.schemaVersion !== SCHEMA.snapshot) throw new TypeError('snapshot schema mismatch');
  assertSafeRef(snapshot.snapshotRef, 'snapshot.snapshotRef');
  assertSafeRef(snapshot.timelineRef, 'snapshot.timelineRef');
  assertSafeRef(snapshot.branchRef, 'snapshot.branchRef');
  assertNonNegativeInteger(snapshot.tick, 'snapshot.tick');
  assertSafeRef(snapshot.determinismEpochRef, 'snapshot.determinismEpochRef');
  assertSha256(snapshot.determinismEpochSha256, 'snapshot.determinismEpochSha256');
  assertSha256(snapshot.worldPackageFingerprint, 'snapshot.worldPackageFingerprint');
  assertNonNegativeInteger(snapshot.eventCount, 'snapshot.eventCount');
  assertSha256(snapshot.eventHeadSha256, 'snapshot.eventHeadSha256');
  assertPlainObject(snapshot.canonicalState, 'snapshot.canonicalState');
  rejectHiddenReasoning(snapshot.canonicalState, 'snapshot.canonicalState');
  assertSha256(snapshot.canonicalStateSha256, 'snapshot.canonicalStateSha256');
  assertSha256(snapshot.snapshotSha256, 'snapshot.snapshotSha256');

  const expectedStateSha256 = hashCanonical(snapshot.canonicalState);
  if (expectedStateSha256 !== snapshot.canonicalStateSha256) {
    throw new TypeError('snapshot canonical state digest mismatch');
  }
  const expectedSnapshotRef = `${snapshot.branchRef}.snapshot.${pad(snapshot.tick, 12)}.${expectedStateSha256.slice(0, 12)}`;
  if (snapshot.snapshotRef !== expectedSnapshotRef) throw new TypeError('snapshot coordinate ref mismatch');

  const { snapshotSha256, ...body } = snapshot;
  if (hashCanonical(body) !== snapshotSha256) throw new TypeError('snapshot digest mismatch');

  if (epoch) {
    validateDeterminismEpoch(epoch);
    if (
      snapshot.determinismEpochRef !== epoch.epochRef ||
      snapshot.determinismEpochSha256 !== epoch.epochSha256 ||
      snapshot.worldPackageFingerprint !== epoch.worldPackageFingerprint
    ) {
      throw new TypeError('snapshot epoch mismatch');
    }
  }

  if (chronicle) {
    verifyChronicle(chronicle);
    if (
      snapshot.timelineRef !== chronicle.timelineRef ||
      snapshot.branchRef !== chronicle.branchRef ||
      snapshot.tick !== chronicle.lastTick ||
      snapshot.eventCount !== chronicle.events.length ||
      snapshot.eventHeadSha256 !== chronicle.headSha256 ||
      snapshot.determinismEpochRef !== chronicle.epoch.epochRef ||
      snapshot.determinismEpochSha256 !== chronicle.epoch.epochSha256 ||
      snapshot.worldPackageFingerprint !== chronicle.epoch.worldPackageFingerprint
    ) {
      throw new TypeError('snapshot Chronicle ancestry mismatch');
    }
  }
  return snapshot;
}

export function forkWorldline({ parentChronicle, snapshot, branchRef, branchClass, formedByRef, purposeRef, assumptionRefs = [] }) {
  verifyChronicle(parentChronicle);
  verifyWorldSnapshot(snapshot, { epoch: parentChronicle.epoch, chronicle: parentChronicle });
  assertSafeRef(branchRef, 'branchRef');
  if (branchRef === parentChronicle.branchRef) throw new TypeError('fork must have a fresh branchRef');
  if (!BRANCH_CLASS.has(branchClass)) throw new TypeError('unsupported branch class');
  assertSafeRef(formedByRef, 'formedByRef');
  assertSafeRef(purposeRef, 'purposeRef');
  assertUniqueSafeRefs(assumptionRefs, 'assumptionRefs');
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

function validateIntelligenceDecisionBody(body, label = 'decision') {
  assertExactKeys(body, [
    'schemaVersion', 'decisionRef', 'participantRef', 'workerRef',
    'sourceObservationRef', 'sourceObservationSha256', 'visibleContextRefs',
    'controllerRef', 'controllerDisposition', 'modelIdentityOrNull',
    'proposedIntent', 'acceptedIntentOrNull', 'rejectionReasonOrNull',
    'fallbackReasonOrNull', 'conciseReasonOrNull'
  ], label);
  if (body.schemaVersion !== SCHEMA.decision) throw new TypeError('decision schema mismatch');
  rejectHiddenReasoning(body, label);
  for (const [key, value] of [
    ['decisionRef', body.decisionRef],
    ['participantRef', body.participantRef],
    ['workerRef', body.workerRef],
    ['sourceObservationRef', body.sourceObservationRef],
    ['controllerRef', body.controllerRef],
    ['controllerDisposition', body.controllerDisposition]
  ]) assertSafeRef(value, key);
  assertSha256(body.sourceObservationSha256, 'sourceObservationSha256');
  assertUniqueSafeRefs(body.visibleContextRefs, 'visibleContextRefs');
  if (body.modelIdentityOrNull !== null) {
    assertExactKeys(body.modelIdentityOrNull, ['modelRef', 'modelDigest'], 'modelIdentityOrNull');
    assertSafeRef(body.modelIdentityOrNull.modelRef, 'modelRef');
    assertSha256(body.modelIdentityOrNull.modelDigest, 'modelDigest');
  }
  validateDecisionProposedIntent(body.proposedIntent);
  if (body.acceptedIntentOrNull !== null) validateDecisionAcceptedIntent(body.acceptedIntentOrNull);
  if (body.rejectionReasonOrNull !== null) assertSafeRef(body.rejectionReasonOrNull, 'rejectionReasonOrNull');
  if (body.fallbackReasonOrNull !== null) assertSafeRef(body.fallbackReasonOrNull, 'fallbackReasonOrNull');

  const accepted = body.acceptedIntentOrNull !== null;
  const rejected = body.rejectionReasonOrNull !== null;
  if (accepted === rejected) {
    throw new TypeError('decision must resolve to exactly one accepted intent or rejection reason');
  }

  const fallback = body.controllerDisposition === 'DETERMINISTIC_FALLBACK';
  if (fallback !== (body.fallbackReasonOrNull !== null)) {
    throw new TypeError('decision fallback disposition/reason mismatch');
  }

  if (body.conciseReasonOrNull !== null) boundedText(body.conciseReasonOrNull, 'conciseReasonOrNull', 240);
  return body;
}

export function verifyIntelligenceDecision(decision) {
  assertPlainObject(decision, 'decision');
  assertExactKeys(decision, [
    'schemaVersion', 'decisionRef', 'participantRef', 'workerRef',
    'sourceObservationRef', 'sourceObservationSha256', 'visibleContextRefs',
    'controllerRef', 'controllerDisposition', 'modelIdentityOrNull',
    'proposedIntent', 'acceptedIntentOrNull', 'rejectionReasonOrNull',
    'fallbackReasonOrNull', 'conciseReasonOrNull', 'decisionSha256'
  ], 'decision');
  assertSha256(decision.decisionSha256, 'decision.decisionSha256');
  const body = canonicalClone(decision);
  delete body.decisionSha256;
  validateIntelligenceDecisionBody(body);
  if (hashCanonical(body) !== decision.decisionSha256) {
    throw new TypeError('decision digest mismatch');
  }
  return decision;
}

export function formIntelligenceDecision(input) {
  assertExactKeys(input, [
    'decisionRef', 'participantRef', 'workerRef',
    'sourceObservationRef', 'sourceObservationSha256', 'visibleContextRefs',
    'controllerRef', 'controllerDisposition', 'modelIdentityOrNull',
    'proposedIntent', 'acceptedIntentOrNull', 'rejectionReasonOrNull',
    'fallbackReasonOrNull', 'conciseReasonOrNull'
  ], 'decision input');
  const body = { schemaVersion: SCHEMA.decision, ...canonicalClone(input) };
  validateIntelligenceDecisionBody(body, 'decision input');
  return frozenCanonical({ ...body, decisionSha256: hashCanonical(body) });
}

export function replayWorldline({
  snapshot,
  sourceChronicle,
  epoch,
  targetBranchRef,
  inputFrames,
  executionKernel,
  expectedStateSha256OrNull = null
}) {
  verifyChronicle(sourceChronicle);
  verifyWorldSnapshot(snapshot, { epoch, chronicle: sourceChronicle });
  validateDeterminismEpoch(epoch);
  assertSafeRef(targetBranchRef, 'targetBranchRef');
  if (!Array.isArray(inputFrames)) throw new TypeError('replay requires inputFrames');
  const validatedKernel = validateExecutionKernel(executionKernel, epoch);
  if (expectedStateSha256OrNull !== null) assertSha256(expectedStateSha256OrNull, 'expectedStateSha256OrNull');

  let state = canonicalClone(snapshot.canonicalState);
  let expectedTick = snapshot.tick + 1;
  const frameHashes = [];
  for (const frame of inputFrames) {
    validateWorldInputFrame(frame);
    if (frame.branchRef !== targetBranchRef || frame.tick !== expectedTick) throw new TypeError('replay frame coordinate mismatch');
    const next = executeReducerInIsolatedContext(validatedKernel.script, {
      state,
      frame,
      epoch,
      bindings: validatedKernel.bindings
    });
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
    executedKernelRef: validatedKernel.kernelRef,
    executedKernelSha256: validatedKernel.kernelSha256,
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


function shaArray(value, label) {
  if (!Array.isArray(value)) throw new TypeError(`${label} must be an array`);
  value.forEach((entry, index) => assertSha256(entry, `${label}[${index}]`));
  return value;
}

export function worldInputSemanticSha256(frame) {
  validateWorldInputFrame(frame);
  return hashCanonical({
    tick: frame.tick,
    humanActionIntents: frame.humanActionIntents,
    companionIntents: frame.companionIntents,
    scheduledWorldEvents: frame.scheduledWorldEvents,
    motionWindowRefs: frame.motionWindowRefs,
    rngStateByStream: frame.rngStateByStream
  });
}

export function formVerifiedHead(input) {
  assertExactKeys(input, ['sessionRef', 'stateVersion', 'chronicle', 'snapshot'], 'verified head input');
  assertSafeRef(input.sessionRef, 'verified head.sessionRef');
  assertNonNegativeInteger(input.stateVersion, 'verified head.stateVersion');
  verifyChronicle(input.chronicle);
  verifyWorldSnapshot(input.snapshot, {
    epoch: input.chronicle.epoch,
    chronicle: input.chronicle
  });

  const body = {
    schemaVersion: SCHEMA.verifiedHead,
    headClass: 'VERIFIED_HEAD',
    headRef: `${input.sessionRef}.verified-head.${pad(input.stateVersion, 10)}.${pad(input.snapshot.tick, 12)}.${input.snapshot.canonicalStateSha256.slice(0, 12)}`,
    sessionRef: input.sessionRef,
    stateVersion: input.stateVersion,
    timelineRef: input.chronicle.timelineRef,
    branchRef: input.chronicle.branchRef,
    tick: input.snapshot.tick,
    eventHeadSha256: input.chronicle.headSha256,
    canonicalStateSha256: input.snapshot.canonicalStateSha256,
    determinismEpochRef: input.chronicle.epoch.epochRef,
    determinismEpochSha256: input.chronicle.epoch.epochSha256,
    worldPackageFingerprint: input.chronicle.epoch.worldPackageFingerprint,
    sourceSnapshotRef: input.snapshot.snapshotRef,
    sourceSnapshotSha256: input.snapshot.snapshotSha256
  };
  return frozenCanonical({ ...body, verifiedHeadSha256: hashCanonical(body) });
}

export function verifyVerifiedHead(head, { chronicle = null, snapshot = null } = {}) {
  assertPlainObject(head, 'verified head');
  assertExactKeys(head, [
    'schemaVersion', 'headClass', 'headRef', 'sessionRef', 'stateVersion',
    'timelineRef', 'branchRef', 'tick', 'eventHeadSha256', 'canonicalStateSha256',
    'determinismEpochRef', 'determinismEpochSha256', 'worldPackageFingerprint',
    'sourceSnapshotRef', 'sourceSnapshotSha256', 'verifiedHeadSha256'
  ], 'verified head');
  if (head.schemaVersion !== SCHEMA.verifiedHead) throw new TypeError('verified head schema mismatch');
  if (head.headClass !== 'VERIFIED_HEAD') throw new TypeError('verified head class mismatch');
  assertSafeRef(head.headRef, 'verified head.headRef');
  assertSafeRef(head.sessionRef, 'verified head.sessionRef');
  assertNonNegativeInteger(head.stateVersion, 'verified head.stateVersion');
  assertSafeRef(head.timelineRef, 'verified head.timelineRef');
  assertSafeRef(head.branchRef, 'verified head.branchRef');
  assertNonNegativeInteger(head.tick, 'verified head.tick');
  assertSha256(head.eventHeadSha256, 'verified head.eventHeadSha256');
  assertSha256(head.canonicalStateSha256, 'verified head.canonicalStateSha256');
  assertSafeRef(head.determinismEpochRef, 'verified head.determinismEpochRef');
  assertSha256(head.determinismEpochSha256, 'verified head.determinismEpochSha256');
  assertSha256(head.worldPackageFingerprint, 'verified head.worldPackageFingerprint');
  assertSafeRef(head.sourceSnapshotRef, 'verified head.sourceSnapshotRef');
  assertSha256(head.sourceSnapshotSha256, 'verified head.sourceSnapshotSha256');
  assertSha256(head.verifiedHeadSha256, 'verified head.verifiedHeadSha256');

  const expectedHeadRef = `${head.sessionRef}.verified-head.${pad(head.stateVersion, 10)}.${pad(head.tick, 12)}.${head.canonicalStateSha256.slice(0, 12)}`;
  if (head.headRef !== expectedHeadRef) throw new TypeError('verified head ref mismatch');
  const { verifiedHeadSha256, ...body } = head;
  if (hashCanonical(body) !== verifiedHeadSha256) throw new TypeError('verified head digest mismatch');

  if (chronicle !== null || snapshot !== null) {
    if (chronicle === null || snapshot === null) {
      throw new TypeError('verified head contextual verification requires Chronicle and snapshot together');
    }
    verifyChronicle(chronicle);
    verifyWorldSnapshot(snapshot, { epoch: chronicle.epoch, chronicle });
    if (
      head.timelineRef !== chronicle.timelineRef ||
      head.branchRef !== chronicle.branchRef ||
      head.tick !== chronicle.lastTick ||
      head.eventHeadSha256 !== chronicle.headSha256 ||
      head.canonicalStateSha256 !== snapshot.canonicalStateSha256 ||
      head.determinismEpochRef !== chronicle.epoch.epochRef ||
      head.determinismEpochSha256 !== chronicle.epoch.epochSha256 ||
      head.worldPackageFingerprint !== chronicle.epoch.worldPackageFingerprint ||
      head.sourceSnapshotRef !== snapshot.snapshotRef ||
      head.sourceSnapshotSha256 !== snapshot.snapshotSha256
    ) {
      throw new TypeError('verified head source coordinate mismatch');
    }
  }
  return head;
}

export function formPredictedHead(input) {
  assertExactKeys(input, [
    'verifiedHead', 'snapshot', 'sourceChronicle', 'epoch',
    'predictionBranchRef', 'inputFrames', 'executionKernel'
  ], 'predicted head input');
  verifyVerifiedHead(input.verifiedHead, {
    chronicle: input.sourceChronicle,
    snapshot: input.snapshot
  });
  validateDeterminismEpoch(input.epoch);
  if (
    input.verifiedHead.determinismEpochRef !== input.epoch.epochRef ||
    input.verifiedHead.determinismEpochSha256 !== input.epoch.epochSha256
  ) {
    throw new TypeError('predicted head epoch does not match verified parent');
  }
  assertSafeRef(input.predictionBranchRef, 'predicted head.predictionBranchRef');
  if (input.predictionBranchRef === input.verifiedHead.branchRef) {
    throw new TypeError('predicted head must use a speculative branch distinct from verified history');
  }
  if (!Array.isArray(input.inputFrames) || input.inputFrames.length === 0) {
    throw new TypeError('predicted head requires at least one speculative input frame');
  }

  const replay = replayWorldline({
    snapshot: input.snapshot,
    sourceChronicle: input.sourceChronicle,
    epoch: input.epoch,
    targetBranchRef: input.predictionBranchRef,
    inputFrames: input.inputFrames,
    executionKernel: input.executionKernel
  });
  const semanticHashes = input.inputFrames.map(worldInputSemanticSha256);
  const predictionCoordinateSha256 = hashCanonical({
    parentVerifiedHeadSha256: input.verifiedHead.verifiedHeadSha256,
    predictionBranchRef: input.predictionBranchRef,
    semanticHashes
  });
  const body = {
    schemaVersion: SCHEMA.predictedHead,
    headClass: 'PREDICTED_HEAD',
    predictionRef: `${input.verifiedHead.sessionRef}.prediction.${predictionCoordinateSha256.slice(0, 24)}`,
    sessionRef: input.verifiedHead.sessionRef,
    parentVerifiedHeadRef: input.verifiedHead.headRef,
    parentVerifiedHeadSha256: input.verifiedHead.verifiedHeadSha256,
    parentStateVersion: input.verifiedHead.stateVersion,
    parentTick: input.verifiedHead.tick,
    predictionBranchRef: input.predictionBranchRef,
    determinismEpochRef: input.epoch.epochRef,
    determinismEpochSha256: input.epoch.epochSha256,
    frameCount: input.inputFrames.length,
    inputFrameSha256s: [...replay.frameHashes],
    inputSemanticSha256s: semanticHashes,
    finalTick: replay.finalTick,
    predictedStateSha256: replay.finalStateSha256,
    replayReceiptSha256: replay.replayReceiptSha256,
    authorityClass: 'LOCAL_SPECULATION_ONLY'
  };
  return Object.freeze({
    predictedHead: frozenCanonical({ ...body, predictedHeadSha256: hashCanonical(body) }),
    replay
  });
}

export function verifyPredictedHead(head, { verifiedHead = null } = {}) {
  assertPlainObject(head, 'predicted head');
  assertExactKeys(head, [
    'schemaVersion', 'headClass', 'predictionRef', 'sessionRef',
    'parentVerifiedHeadRef', 'parentVerifiedHeadSha256', 'parentStateVersion',
    'parentTick', 'predictionBranchRef', 'determinismEpochRef',
    'determinismEpochSha256', 'frameCount', 'inputFrameSha256s',
    'inputSemanticSha256s', 'finalTick', 'predictedStateSha256',
    'replayReceiptSha256', 'authorityClass', 'predictedHeadSha256'
  ], 'predicted head');
  if (head.schemaVersion !== SCHEMA.predictedHead) throw new TypeError('predicted head schema mismatch');
  if (head.headClass !== 'PREDICTED_HEAD') throw new TypeError('predicted head class mismatch');
  if (head.authorityClass !== 'LOCAL_SPECULATION_ONLY') throw new TypeError('predicted head cannot claim accepted authority');
  assertSafeRef(head.predictionRef, 'predicted head.predictionRef');
  assertSafeRef(head.sessionRef, 'predicted head.sessionRef');
  assertSafeRef(head.parentVerifiedHeadRef, 'predicted head.parentVerifiedHeadRef');
  assertSha256(head.parentVerifiedHeadSha256, 'predicted head.parentVerifiedHeadSha256');
  assertNonNegativeInteger(head.parentStateVersion, 'predicted head.parentStateVersion');
  assertNonNegativeInteger(head.parentTick, 'predicted head.parentTick');
  assertSafeRef(head.predictionBranchRef, 'predicted head.predictionBranchRef');
  assertSafeRef(head.determinismEpochRef, 'predicted head.determinismEpochRef');
  assertSha256(head.determinismEpochSha256, 'predicted head.determinismEpochSha256');
  assertNonNegativeInteger(head.frameCount, 'predicted head.frameCount');
  shaArray(head.inputFrameSha256s, 'predicted head.inputFrameSha256s');
  shaArray(head.inputSemanticSha256s, 'predicted head.inputSemanticSha256s');
  if (
    head.frameCount === 0 ||
    head.inputFrameSha256s.length !== head.frameCount ||
    head.inputSemanticSha256s.length !== head.frameCount
  ) {
    throw new TypeError('predicted head frame evidence count mismatch');
  }
  assertNonNegativeInteger(head.finalTick, 'predicted head.finalTick');
  if (head.finalTick !== head.parentTick + head.frameCount) {
    throw new TypeError('predicted head final tick mismatch');
  }
  assertSha256(head.predictedStateSha256, 'predicted head.predictedStateSha256');
  assertSha256(head.replayReceiptSha256, 'predicted head.replayReceiptSha256');
  assertSha256(head.predictedHeadSha256, 'predicted head.predictedHeadSha256');
  const { predictedHeadSha256, ...body } = head;
  if (hashCanonical(body) !== predictedHeadSha256) throw new TypeError('predicted head digest mismatch');

  if (verifiedHead !== null) {
    verifyVerifiedHead(verifiedHead);
    if (
      head.sessionRef !== verifiedHead.sessionRef ||
      head.parentVerifiedHeadRef !== verifiedHead.headRef ||
      head.parentVerifiedHeadSha256 !== verifiedHead.verifiedHeadSha256 ||
      head.parentStateVersion !== verifiedHead.stateVersion ||
      head.parentTick !== verifiedHead.tick ||
      head.determinismEpochRef !== verifiedHead.determinismEpochRef ||
      head.determinismEpochSha256 !== verifiedHead.determinismEpochSha256 ||
      head.predictionBranchRef === verifiedHead.branchRef
    ) {
      throw new TypeError('predicted head parent coordinate mismatch');
    }
  }
  return head;
}

export function comparePredictionWithAuthoritativeInputs(input) {
  assertExactKeys(input, ['predictedHead', 'authoritativeInputFrames'], 'prediction comparison input');
  verifyPredictedHead(input.predictedHead);
  if (!Array.isArray(input.authoritativeInputFrames)) {
    throw new TypeError('authoritativeInputFrames must be an array');
  }
  const authoritativeSemanticSha256s = input.authoritativeInputFrames.map(worldInputSemanticSha256);
  const expected = input.predictedHead.inputSemanticSha256s;
  const maxLength = Math.max(expected.length, authoritativeSemanticSha256s.length);
  let firstMismatchIndexOrNull = null;
  for (let index = 0; index < maxLength; index += 1) {
    if (expected[index] !== authoritativeSemanticSha256s[index]) {
      firstMismatchIndexOrNull = index;
      break;
    }
  }
  const body = {
    schemaVersion: SCHEMA.predictionComparison,
    predictionRef: input.predictedHead.predictionRef,
    predictedHeadSha256: input.predictedHead.predictedHeadSha256,
    classification: firstMismatchIndexOrNull === null
      ? 'MATCHED_AUTHORITATIVE_INPUTS'
      : 'DIVERGENT_AUTHORITATIVE_INPUTS',
    firstMismatchIndexOrNull,
    predictedSemanticSha256s: [...expected],
    authoritativeSemanticSha256s
  };
  return frozenCanonical({ ...body, comparisonSha256: hashCanonical(body) });
}

export function reconcilePredictedHead(input) {
  assertExactKeys(input, [
    'predictedHead', 'verifiedHead', 'snapshot', 'sourceChronicle', 'epoch',
    'authoritativeBranchRef', 'authoritativeInputFrames', 'executionKernel'
  ], 'prediction reconciliation input');
  verifyVerifiedHead(input.verifiedHead, {
    chronicle: input.sourceChronicle,
    snapshot: input.snapshot
  });
  verifyPredictedHead(input.predictedHead, { verifiedHead: input.verifiedHead });
  assertSafeRef(input.authoritativeBranchRef, 'authoritativeBranchRef');
  if (input.authoritativeBranchRef !== input.verifiedHead.branchRef) {
    throw new TypeError('authoritative reconciliation must continue the verified branch');
  }

  const comparison = comparePredictionWithAuthoritativeInputs({
    predictedHead: input.predictedHead,
    authoritativeInputFrames: input.authoritativeInputFrames
  });
  const replay = replayWorldline({
    snapshot: input.snapshot,
    sourceChronicle: input.sourceChronicle,
    epoch: input.epoch,
    targetBranchRef: input.authoritativeBranchRef,
    inputFrames: input.authoritativeInputFrames,
    executionKernel: input.executionKernel
  });

  if (
    comparison.classification === 'MATCHED_AUTHORITATIVE_INPUTS' &&
    replay.finalStateSha256 !== input.predictedHead.predictedStateSha256
  ) {
    throw new TypeError('matched authoritative inputs did not reproduce predicted state');
  }

  const mode = comparison.classification === 'MATCHED_AUTHORITATIVE_INPUTS'
    ? 'MATCHED_PREDICTION'
    : 'DIVERGENT_ROLLBACK';
  const body = {
    schemaVersion: SCHEMA.rollback,
    rollbackRef: `${input.verifiedHead.sessionRef}.rollback.${hashCanonical({
      prediction: input.predictedHead.predictedHeadSha256,
      authoritative: comparison.authoritativeSemanticSha256s
    }).slice(0, 24)}`,
    mode,
    parentVerifiedHeadRef: input.verifiedHead.headRef,
    parentVerifiedHeadSha256: input.verifiedHead.verifiedHeadSha256,
    discardedPredictionRef: input.predictedHead.predictionRef,
    discardedPredictedHeadSha256: input.predictedHead.predictedHeadSha256,
    authoritativeBranchRef: input.authoritativeBranchRef,
    firstMismatchIndexOrNull: comparison.firstMismatchIndexOrNull,
    authoritativeInputFrameSha256s: [...replay.frameHashes],
    authoritativeInputSemanticSha256s: [...comparison.authoritativeSemanticSha256s],
    startTick: replay.startTick,
    finalTick: replay.finalTick,
    reconciledStateSha256: replay.finalStateSha256,
    authoritativeReplayReceiptSha256: replay.replayReceiptSha256,
    verifiedParentEventHeadSha256: input.verifiedHead.eventHeadSha256,
    verifiedParentPreserved: true
  };
  return Object.freeze({
    rollbackReceipt: frozenCanonical({ ...body, rollbackReceiptSha256: hashCanonical(body) }),
    authoritativeReplay: replay,
    comparison
  });
}

export function verifyRollbackReceipt(receipt, { predictedHead = null, verifiedHead = null } = {}) {
  assertPlainObject(receipt, 'rollback receipt');
  assertExactKeys(receipt, [
    'schemaVersion', 'rollbackRef', 'mode', 'parentVerifiedHeadRef',
    'parentVerifiedHeadSha256', 'discardedPredictionRef',
    'discardedPredictedHeadSha256', 'authoritativeBranchRef',
    'firstMismatchIndexOrNull', 'authoritativeInputFrameSha256s',
    'authoritativeInputSemanticSha256s', 'startTick', 'finalTick',
    'reconciledStateSha256', 'authoritativeReplayReceiptSha256',
    'verifiedParentEventHeadSha256', 'verifiedParentPreserved',
    'rollbackReceiptSha256'
  ], 'rollback receipt');
  if (receipt.schemaVersion !== SCHEMA.rollback) throw new TypeError('rollback receipt schema mismatch');
  if (!['MATCHED_PREDICTION', 'DIVERGENT_ROLLBACK'].includes(receipt.mode)) {
    throw new TypeError('rollback receipt mode invalid');
  }
  assertSafeRef(receipt.rollbackRef, 'rollback receipt.rollbackRef');
  assertSafeRef(receipt.parentVerifiedHeadRef, 'rollback receipt.parentVerifiedHeadRef');
  assertSha256(receipt.parentVerifiedHeadSha256, 'rollback receipt.parentVerifiedHeadSha256');
  assertSafeRef(receipt.discardedPredictionRef, 'rollback receipt.discardedPredictionRef');
  assertSha256(receipt.discardedPredictedHeadSha256, 'rollback receipt.discardedPredictedHeadSha256');
  assertSafeRef(receipt.authoritativeBranchRef, 'rollback receipt.authoritativeBranchRef');
  if (receipt.firstMismatchIndexOrNull !== null) {
    assertNonNegativeInteger(receipt.firstMismatchIndexOrNull, 'rollback receipt.firstMismatchIndexOrNull');
  }
  if (
    (receipt.mode === 'MATCHED_PREDICTION') !==
    (receipt.firstMismatchIndexOrNull === null)
  ) {
    throw new TypeError('rollback receipt mode/mismatch classification inconsistent');
  }
  shaArray(receipt.authoritativeInputFrameSha256s, 'rollback receipt.authoritativeInputFrameSha256s');
  shaArray(receipt.authoritativeInputSemanticSha256s, 'rollback receipt.authoritativeInputSemanticSha256s');
  if (receipt.authoritativeInputFrameSha256s.length !== receipt.authoritativeInputSemanticSha256s.length) {
    throw new TypeError('rollback receipt authoritative input evidence count mismatch');
  }
  assertNonNegativeInteger(receipt.startTick, 'rollback receipt.startTick');
  assertNonNegativeInteger(receipt.finalTick, 'rollback receipt.finalTick');
  if (receipt.finalTick !== receipt.startTick + receipt.authoritativeInputFrameSha256s.length) {
    throw new TypeError('rollback receipt final tick mismatch');
  }
  assertSha256(receipt.reconciledStateSha256, 'rollback receipt.reconciledStateSha256');
  assertSha256(receipt.authoritativeReplayReceiptSha256, 'rollback receipt.authoritativeReplayReceiptSha256');
  assertSha256(receipt.verifiedParentEventHeadSha256, 'rollback receipt.verifiedParentEventHeadSha256');
  if (receipt.verifiedParentPreserved !== true) throw new TypeError('rollback receipt must preserve verified parent');
  assertSha256(receipt.rollbackReceiptSha256, 'rollback receipt.rollbackReceiptSha256');
  const { rollbackReceiptSha256, ...body } = receipt;
  if (hashCanonical(body) !== rollbackReceiptSha256) throw new TypeError('rollback receipt digest mismatch');

  if (predictedHead !== null) {
    verifyPredictedHead(predictedHead);
    if (
      receipt.discardedPredictionRef !== predictedHead.predictionRef ||
      receipt.discardedPredictedHeadSha256 !== predictedHead.predictedHeadSha256
    ) throw new TypeError('rollback receipt prediction mismatch');

    const expectedSemantic = predictedHead.inputSemanticSha256s;
    const actualSemantic = receipt.authoritativeInputSemanticSha256s;
    const maxLength = Math.max(expectedSemantic.length, actualSemantic.length);
    let expectedMismatchIndexOrNull = null;
    for (let index = 0; index < maxLength; index += 1) {
      if (expectedSemantic[index] !== actualSemantic[index]) {
        expectedMismatchIndexOrNull = index;
        break;
      }
    }
    const expectedMode = expectedMismatchIndexOrNull === null
      ? 'MATCHED_PREDICTION'
      : 'DIVERGENT_ROLLBACK';
    if (
      receipt.mode !== expectedMode ||
      receipt.firstMismatchIndexOrNull !== expectedMismatchIndexOrNull
    ) {
      throw new TypeError('rollback receipt semantic comparison mismatch');
    }
  }
  if (verifiedHead !== null) {
    verifyVerifiedHead(verifiedHead);
    if (
      receipt.parentVerifiedHeadRef !== verifiedHead.headRef ||
      receipt.parentVerifiedHeadSha256 !== verifiedHead.verifiedHeadSha256 ||
      receipt.authoritativeBranchRef !== verifiedHead.branchRef ||
      receipt.verifiedParentEventHeadSha256 !== verifiedHead.eventHeadSha256
    ) throw new TypeError('rollback receipt verified parent mismatch');
  }
  return receipt;
}

export function formAuthoritativeResyncReceipt(input) {
  assertExactKeys(input, [
    'verifiedHead', 'rollbackReceipt', 'hostId', 'hostLeaseGeneration',
    'expectedStateVersion', 'acceptedStateVersion', 'acceptedCheckpointSha256'
  ], 'authoritative resync input');
  verifyVerifiedHead(input.verifiedHead);
  verifyRollbackReceipt(input.rollbackReceipt, { verifiedHead: input.verifiedHead });
  assertSafeRef(input.hostId, 'authoritative resync.hostId');
  assertNonNegativeInteger(input.hostLeaseGeneration, 'authoritative resync.hostLeaseGeneration');
  if (input.hostLeaseGeneration < 1) {
    throw new TypeError('authoritative resync requires a positive host lease generation');
  }
  assertNonNegativeInteger(input.expectedStateVersion, 'authoritative resync.expectedStateVersion');
  assertNonNegativeInteger(input.acceptedStateVersion, 'authoritative resync.acceptedStateVersion');
  if (input.expectedStateVersion !== input.verifiedHead.stateVersion) {
    throw new TypeError('authoritative resync expected stateVersion does not match verified head');
  }
  if (input.acceptedStateVersion !== input.expectedStateVersion + 1) {
    throw new TypeError('authoritative resync accepted stateVersion must advance exactly once');
  }
  assertSha256(input.acceptedCheckpointSha256, 'authoritative resync.acceptedCheckpointSha256');
  if (input.acceptedCheckpointSha256 !== input.rollbackReceipt.reconciledStateSha256) {
    throw new TypeError('authoritative resync checkpoint hash does not match reconciled state');
  }

  const body = {
    schemaVersion: SCHEMA.resync,
    resyncRef: `${input.verifiedHead.sessionRef}.resync.${pad(input.acceptedStateVersion, 10)}.${input.rollbackReceipt.reconciledStateSha256.slice(0, 12)}`,
    resyncMode: 'LOCAL_SYNTHETIC_AUTHORITATIVE_RESYNC',
    sessionRef: input.verifiedHead.sessionRef,
    sourceVerifiedHeadRef: input.verifiedHead.headRef,
    sourceVerifiedHeadSha256: input.verifiedHead.verifiedHeadSha256,
    rollbackRef: input.rollbackReceipt.rollbackRef,
    rollbackReceiptSha256: input.rollbackReceipt.rollbackReceiptSha256,
    hostId: input.hostId,
    hostLeaseGeneration: input.hostLeaseGeneration,
    expectedStateVersion: input.expectedStateVersion,
    acceptedStateVersion: input.acceptedStateVersion,
    acceptedCheckpointSha256: input.acceptedCheckpointSha256,
    reconciledStateSha256: input.rollbackReceipt.reconciledStateSha256,
    authorityClass: 'ONE_ACTIVE_AUTHORITATIVE_HOST_LEASE'
  };
  return frozenCanonical({ ...body, resyncReceiptSha256: hashCanonical(body) });
}

export function verifyAuthoritativeResyncReceipt(receipt, { verifiedHead = null, rollbackReceipt = null } = {}) {
  assertPlainObject(receipt, 'authoritative resync receipt');
  assertExactKeys(receipt, [
    'schemaVersion', 'resyncRef', 'resyncMode', 'sessionRef',
    'sourceVerifiedHeadRef', 'sourceVerifiedHeadSha256', 'rollbackRef',
    'rollbackReceiptSha256', 'hostId', 'hostLeaseGeneration',
    'expectedStateVersion', 'acceptedStateVersion', 'acceptedCheckpointSha256',
    'reconciledStateSha256', 'authorityClass', 'resyncReceiptSha256'
  ], 'authoritative resync receipt');
  if (receipt.schemaVersion !== SCHEMA.resync) throw new TypeError('authoritative resync receipt schema mismatch');
  if (receipt.resyncMode !== 'LOCAL_SYNTHETIC_AUTHORITATIVE_RESYNC') throw new TypeError('authoritative resync mode mismatch');
  if (receipt.authorityClass !== 'ONE_ACTIVE_AUTHORITATIVE_HOST_LEASE') throw new TypeError('authoritative resync authority class mismatch');
  assertSafeRef(receipt.resyncRef, 'authoritative resync.resyncRef');
  assertSafeRef(receipt.sessionRef, 'authoritative resync.sessionRef');
  assertSafeRef(receipt.sourceVerifiedHeadRef, 'authoritative resync.sourceVerifiedHeadRef');
  assertSha256(receipt.sourceVerifiedHeadSha256, 'authoritative resync.sourceVerifiedHeadSha256');
  assertSafeRef(receipt.rollbackRef, 'authoritative resync.rollbackRef');
  assertSha256(receipt.rollbackReceiptSha256, 'authoritative resync.rollbackReceiptSha256');
  assertSafeRef(receipt.hostId, 'authoritative resync.hostId');
  assertNonNegativeInteger(receipt.hostLeaseGeneration, 'authoritative resync.hostLeaseGeneration');
  if (receipt.hostLeaseGeneration < 1) {
    throw new TypeError('authoritative resync requires a positive host lease generation');
  }
  assertNonNegativeInteger(receipt.expectedStateVersion, 'authoritative resync.expectedStateVersion');
  assertNonNegativeInteger(receipt.acceptedStateVersion, 'authoritative resync.acceptedStateVersion');
  if (receipt.acceptedStateVersion !== receipt.expectedStateVersion + 1) {
    throw new TypeError('authoritative resync stateVersion advance mismatch');
  }
  assertSha256(receipt.acceptedCheckpointSha256, 'authoritative resync.acceptedCheckpointSha256');
  assertSha256(receipt.reconciledStateSha256, 'authoritative resync.reconciledStateSha256');
  if (receipt.acceptedCheckpointSha256 !== receipt.reconciledStateSha256) {
    throw new TypeError('authoritative resync checkpoint/reconciled-state mismatch');
  }
  assertSha256(receipt.resyncReceiptSha256, 'authoritative resync.resyncReceiptSha256');
  const { resyncReceiptSha256, ...body } = receipt;
  if (hashCanonical(body) !== resyncReceiptSha256) throw new TypeError('authoritative resync receipt digest mismatch');

  if (verifiedHead !== null) {
    verifyVerifiedHead(verifiedHead);
    if (
      receipt.sessionRef !== verifiedHead.sessionRef ||
      receipt.sourceVerifiedHeadRef !== verifiedHead.headRef ||
      receipt.sourceVerifiedHeadSha256 !== verifiedHead.verifiedHeadSha256 ||
      receipt.expectedStateVersion !== verifiedHead.stateVersion
    ) throw new TypeError('authoritative resync verified-head mismatch');
  }
  if (rollbackReceipt !== null) {
    verifyRollbackReceipt(rollbackReceipt);
    if (
      receipt.rollbackRef !== rollbackReceipt.rollbackRef ||
      receipt.rollbackReceiptSha256 !== rollbackReceipt.rollbackReceiptSha256 ||
      receipt.reconciledStateSha256 !== rollbackReceipt.reconciledStateSha256
    ) throw new TypeError('authoritative resync rollback mismatch');
  }
  return receipt;
}
