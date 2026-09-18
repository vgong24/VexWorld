import {
  assertExactKeys,
  assertNonNegativeInteger,
  assertPlainObject,
  assertSafeRef,
  assertSha256,
  assertUniqueSafeRefs,
  canonicalClone,
  canonicalJson,
  frozenCanonical,
  hashCanonical,
  rejectHiddenReasoning
} from './canonical.mjs';
import {
  verifyChronicle,
  verifyWorldSnapshot
} from './chronicle.mjs';
import { verifyMotionWindow } from './motion-tail.mjs';

export const WORLD_MEMORY_SCHEMA = Object.freeze({
  projection: 'vexworld.world-memory-projection/v1',
  forkRequest: 'vexworld.world-memory-fork-request/v1',
  savedMoment: 'vexworld.saved-moment-descriptor/v1',
  permissionRequest: 'vexworld.world-memory-permission-request/v1',
  policyDecision: 'vexworld.world-memory-policy-decision/v1',
  authorization: 'vexworld.world-memory-authorization/v1'
});

export const WORLD_MEMORY_CAPABILITIES = Object.freeze([
  'capability.world-memory.view',
  'capability.world-memory.replay',
  'capability.world-memory.fork-private',
  'capability.world-memory.fork-shared',
  'capability.world-memory.redistribute'
]);

const CAPABILITY = new Set(WORLD_MEMORY_CAPABILITIES);
const PROJECTABLE_PRIVACY = new Set([
  'PUBLIC_WORLD',
  'PARTY_SHARED',
  'PARTICIPANT_PRIVATE'
]);
const PRIVACY_RANK = new Map([
  ['PUBLIC_WORLD', 0],
  ['PARTY_SHARED', 1],
  ['PARTICIPANT_PRIVATE', 2]
]);
const REQUEST_RETENTION = new Set([
  'TRANSIENT_REPLAY',
  'EXPLICIT_SAVED_MOMENT'
]);
const POLICY_DECISION_CLASS = new Set([
  'ALLOW',
  'NARROW',
  'DEFER',
  'DENY',
  'REVOKE'
]);
const AUTHORIZATION_CLASS = new Set([
  'AUTHORIZED',
  'DEFERRED',
  'DENIED',
  'REVOKED'
]);

function assertPrivacy(value, label) {
  if (!PROJECTABLE_PRIVACY.has(value)) {
    throw new TypeError(`${label} is not a projectable World Memory privacy class`);
  }
  return value;
}

function assertRetention(value, label) {
  if (!REQUEST_RETENTION.has(value)) {
    throw new TypeError(`${label} is not a supported World Memory retention request`);
  }
  return value;
}

function assertCapabilities(values, label, { allowEmpty = false } = {}) {
  assertUniqueSafeRefs(values, label, { allowEmpty });
  for (const value of values) {
    if (!CAPABILITY.has(value)) throw new TypeError(`${label} contains an unsupported capability`);
  }
  return values;
}

function assertNullableSafeRef(value, label) {
  if (value !== null) assertSafeRef(value, label);
  return value;
}

function arraysEqual(left, right) {
  return canonicalJson(left) === canonicalJson(right);
}

function subsetOf(values, allowed) {
  const allowedSet = new Set(allowed);
  return values.every((value) => allowedSet.has(value));
}

function sameSet(left, right) {
  return left.length === right.length &&
    subsetOf(left, right) &&
    subsetOf(right, left);
}

function strictestPrivacy(classes) {
  if (!classes.length) return 'PUBLIC_WORLD';
  let winner = 'PUBLIC_WORLD';
  for (const value of classes) {
    assertPrivacy(value, 'source privacyClass');
    if (PRIVACY_RANK.get(value) > PRIVACY_RANK.get(winner)) winner = value;
  }
  return winner;
}

function assertProjectionPrivacy(requested, sourceClasses) {
  assertPrivacy(requested, 'projection.privacyClass');
  const minimum = strictestPrivacy(sourceClasses);
  if (PRIVACY_RANK.get(requested) < PRIVACY_RANK.get(minimum)) {
    throw new TypeError('World Memory projection cannot widen source privacy');
  }
  return requested;
}

function projectionEventMap(chronicle) {
  return new Map(chronicle.events.map((event) => [event.eventRef, event]));
}

function decisionRefLinkedByEvent(event, decisionRef) {
  return event.causationRefs.includes(decisionRef) ||
    event.payload?.decisionRef === decisionRef;
}

function normalizeMotionWindows(windows) {
  if (!Array.isArray(windows)) throw new TypeError('motionWindows must be an array');
  const seen = new Set();
  const normalized = [];
  for (const window of windows) {
    verifyMotionWindow(window);
    if (seen.has(window.windowRef)) throw new TypeError('motionWindows must contain unique window refs');
    seen.add(window.windowRef);
    normalized.push(window);
  }
  return normalized;
}

function resolveProjectionEvidence({
  chronicle,
  snapshot,
  fromTick,
  toTick,
  includedEventRefs,
  includedDecisionRefs,
  includedMotionWindows,
  privacyClass
}) {
  verifyChronicle(chronicle);
  verifyWorldSnapshot(snapshot, { epoch: chronicle.epoch, chronicle });

  assertNonNegativeInteger(fromTick, 'projection.fromTick');
  assertNonNegativeInteger(toTick, 'projection.toTick');
  if (toTick < fromTick) throw new TypeError('projection toTick must be >= fromTick');
  if (fromTick < chronicle.baseTick || toTick > chronicle.lastTick) {
    throw new TypeError('projection interval is outside source Chronicle bounds');
  }
  if (snapshot.tick !== toTick) {
    throw new TypeError('projection source snapshot must anchor the exact toTick');
  }

  assertUniqueSafeRefs(includedEventRefs, 'projection.includedEventRefs', { allowEmpty: false });
  assertUniqueSafeRefs(includedDecisionRefs, 'projection.includedDecisionRefs');

  const eventMap = projectionEventMap(chronicle);
  const selectedEvents = [];
  for (const eventRef of includedEventRefs) {
    const event = eventMap.get(eventRef);
    if (!event) throw new TypeError('projection eventRef is not present in source Chronicle');
    if (event.tick < fromTick || event.tick > toTick) {
      throw new TypeError('projection eventRef falls outside selected interval');
    }
    if (!PROJECTABLE_PRIVACY.has(event.privacyClass)) {
      throw new TypeError('projection cannot include a protected/non-user-facing Chronicle event');
    }
    selectedEvents.push(event);
  }

  const selectedSet = new Set(includedEventRefs);
  const sourceOrderedRefs = chronicle.events
    .filter((event) => selectedSet.has(event.eventRef))
    .map((event) => event.eventRef);
  if (!arraysEqual(sourceOrderedRefs, includedEventRefs)) {
    throw new TypeError('projection event refs must preserve source Chronicle order');
  }

  for (const decisionRef of includedDecisionRefs) {
    if (!selectedEvents.some((event) => decisionRefLinkedByEvent(event, decisionRef))) {
      throw new TypeError('projection decisionRef is not causally linked by an included Chronicle event');
    }
  }

  const windows = normalizeMotionWindows(includedMotionWindows);
  const motionWindowRefs = [];
  const motionWindowSha256s = [];
  for (const window of windows) {
    if (window.fromTick < fromTick || window.toTick > toTick) {
      throw new TypeError('projection motion window falls outside selected interval');
    }
    for (const eventRef of window.eventRefs) {
      if (!selectedSet.has(eventRef)) {
        throw new TypeError('projection motion window references an event not included in projection');
      }
    }
    motionWindowRefs.push(window.windowRef);
    motionWindowSha256s.push(window.motionWindowSha256);
  }

  const sourcePrivacy = [
    ...selectedEvents.map((event) => event.privacyClass),
    ...windows.map((window) => window.privacyClass)
  ];
  assertProjectionPrivacy(privacyClass, sourcePrivacy);

  return {
    selectedEvents,
    eventSha256s: selectedEvents.map((event) => event.eventSha256),
    motionWindowRefs,
    motionWindowSha256s
  };
}

export function formWorldMemoryProjection(input) {
  assertExactKeys(input, [
    'chronicle', 'snapshot', 'viewerParticipantRef', 'fromTick', 'toTick',
    'includedEventRefs', 'includedDecisionRefs', 'includedMotionWindows',
    'privacyClass'
  ], 'World Memory projection input');
  assertSafeRef(input.viewerParticipantRef, 'projection.viewerParticipantRef');

  const resolved = resolveProjectionEvidence({
    chronicle: input.chronicle,
    snapshot: input.snapshot,
    fromTick: input.fromTick,
    toTick: input.toTick,
    includedEventRefs: input.includedEventRefs,
    includedDecisionRefs: input.includedDecisionRefs,
    includedMotionWindows: input.includedMotionWindows,
    privacyClass: input.privacyClass
  });

  const coordinateSha256 = hashCanonical({
    viewerParticipantRef: input.viewerParticipantRef,
    sourceTimelineRef: input.chronicle.timelineRef,
    sourceBranchRef: input.chronicle.branchRef,
    sourceEventHeadSha256: input.chronicle.headSha256,
    sourceSnapshotSha256: input.snapshot.snapshotSha256,
    fromTick: input.fromTick,
    toTick: input.toTick,
    includedEventRefs: input.includedEventRefs,
    includedDecisionRefs: input.includedDecisionRefs,
    includedMotionWindowRefs: resolved.motionWindowRefs
  });

  const body = {
    schemaVersion: WORLD_MEMORY_SCHEMA.projection,
    projectionRef: `world-memory.projection.${coordinateSha256.slice(0, 32)}`,
    projectionMode: 'READ_ONLY_WORLD_MEMORY',
    viewerParticipantRef: input.viewerParticipantRef,
    sourceTimelineRef: input.chronicle.timelineRef,
    sourceBranchRef: input.chronicle.branchRef,
    sourceEventHeadSha256: input.chronicle.headSha256,
    sourceSnapshotRef: input.snapshot.snapshotRef,
    sourceSnapshotSha256: input.snapshot.snapshotSha256,
    sourceSnapshotTick: input.snapshot.tick,
    fromTick: input.fromTick,
    toTick: input.toTick,
    includedEventRefs: [...input.includedEventRefs],
    includedEventSha256s: [...resolved.eventSha256s],
    includedDecisionRefs: [...input.includedDecisionRefs],
    includedMotionWindowRefs: [...resolved.motionWindowRefs],
    includedMotionWindowSha256s: [...resolved.motionWindowSha256s],
    privacyClass: input.privacyClass,
    retentionClass: 'TRANSIENT_REPLAY',
    historyMutation: false,
    modelReinference: false,
    worldEffectPerformed: false
  };
  return frozenCanonical({ ...body, projectionSha256: hashCanonical(body) });
}

export function verifyWorldMemoryProjection(projection, {
  chronicle = null,
  snapshot = null,
  motionWindows = null
} = {}) {
  assertPlainObject(projection, 'World Memory projection');
  assertExactKeys(projection, [
    'schemaVersion', 'projectionRef', 'projectionMode', 'viewerParticipantRef',
    'sourceTimelineRef', 'sourceBranchRef', 'sourceEventHeadSha256',
    'sourceSnapshotRef', 'sourceSnapshotSha256', 'sourceSnapshotTick',
    'fromTick', 'toTick', 'includedEventRefs', 'includedEventSha256s',
    'includedDecisionRefs', 'includedMotionWindowRefs',
    'includedMotionWindowSha256s', 'privacyClass', 'retentionClass',
    'historyMutation', 'modelReinference', 'worldEffectPerformed',
    'projectionSha256'
  ], 'World Memory projection');
  if (projection.schemaVersion !== WORLD_MEMORY_SCHEMA.projection) {
    throw new TypeError('World Memory projection schema mismatch');
  }
  if (projection.projectionMode !== 'READ_ONLY_WORLD_MEMORY') {
    throw new TypeError('World Memory projection mode mismatch');
  }
  assertSafeRef(projection.projectionRef, 'projection.projectionRef');
  assertSafeRef(projection.viewerParticipantRef, 'projection.viewerParticipantRef');
  assertSafeRef(projection.sourceTimelineRef, 'projection.sourceTimelineRef');
  assertSafeRef(projection.sourceBranchRef, 'projection.sourceBranchRef');
  assertSha256(projection.sourceEventHeadSha256, 'projection.sourceEventHeadSha256');
  assertSafeRef(projection.sourceSnapshotRef, 'projection.sourceSnapshotRef');
  assertSha256(projection.sourceSnapshotSha256, 'projection.sourceSnapshotSha256');
  assertNonNegativeInteger(projection.sourceSnapshotTick, 'projection.sourceSnapshotTick');
  assertNonNegativeInteger(projection.fromTick, 'projection.fromTick');
  assertNonNegativeInteger(projection.toTick, 'projection.toTick');
  if (projection.toTick < projection.fromTick) throw new TypeError('projection toTick must be >= fromTick');
  assertUniqueSafeRefs(projection.includedEventRefs, 'projection.includedEventRefs', { allowEmpty: false });
  if (!Array.isArray(projection.includedEventSha256s) ||
      projection.includedEventSha256s.length !== projection.includedEventRefs.length) {
    throw new TypeError('projection event evidence count mismatch');
  }
  projection.includedEventSha256s.forEach((hash, index) =>
    assertSha256(hash, `projection.includedEventSha256s[${index}]`));
  assertUniqueSafeRefs(projection.includedDecisionRefs, 'projection.includedDecisionRefs');
  assertUniqueSafeRefs(projection.includedMotionWindowRefs, 'projection.includedMotionWindowRefs');
  if (!Array.isArray(projection.includedMotionWindowSha256s) ||
      projection.includedMotionWindowSha256s.length !== projection.includedMotionWindowRefs.length) {
    throw new TypeError('projection motion-window evidence count mismatch');
  }
  projection.includedMotionWindowSha256s.forEach((hash, index) =>
    assertSha256(hash, `projection.includedMotionWindowSha256s[${index}]`));
  assertPrivacy(projection.privacyClass, 'projection.privacyClass');
  if (projection.retentionClass !== 'TRANSIENT_REPLAY') {
    throw new TypeError('World Memory projection must remain transient replay evidence');
  }
  if (
    projection.historyMutation !== false ||
    projection.modelReinference !== false ||
    projection.worldEffectPerformed !== false
  ) {
    throw new TypeError('World Memory replay projection must be read-only and effect-free');
  }
  rejectHiddenReasoning(projection, 'World Memory projection');
  assertSha256(projection.projectionSha256, 'projection.projectionSha256');
  const { projectionSha256, ...body } = projection;
  if (hashCanonical(body) !== projectionSha256) throw new TypeError('World Memory projection digest mismatch');

  const contextual = chronicle !== null || snapshot !== null || motionWindows !== null;
  if (contextual) {
    if (chronicle === null || snapshot === null || motionWindows === null) {
      throw new TypeError('projection contextual verification requires Chronicle, snapshot and motionWindows together');
    }
    const resolved = resolveProjectionEvidence({
      chronicle,
      snapshot,
      fromTick: projection.fromTick,
      toTick: projection.toTick,
      includedEventRefs: projection.includedEventRefs,
      includedDecisionRefs: projection.includedDecisionRefs,
      includedMotionWindows: motionWindows,
      privacyClass: projection.privacyClass
    });
    if (
      projection.sourceTimelineRef !== chronicle.timelineRef ||
      projection.sourceBranchRef !== chronicle.branchRef ||
      projection.sourceEventHeadSha256 !== chronicle.headSha256 ||
      projection.sourceSnapshotRef !== snapshot.snapshotRef ||
      projection.sourceSnapshotSha256 !== snapshot.snapshotSha256 ||
      projection.sourceSnapshotTick !== snapshot.tick ||
      !arraysEqual(projection.includedEventSha256s, resolved.eventSha256s) ||
      !arraysEqual(projection.includedMotionWindowRefs, resolved.motionWindowRefs) ||
      !arraysEqual(projection.includedMotionWindowSha256s, resolved.motionWindowSha256s)
    ) {
      throw new TypeError('World Memory projection source evidence mismatch');
    }
  }
  return projection;
}

export function formPrivateRehearsalForkRequest(input) {
  assertExactKeys(input, [
    'projection', 'snapshot', 'requestedBranchRef',
    'formedByParticipantRef', 'purposeRef', 'assumptionRefs'
  ], 'private rehearsal fork request input');
  verifyWorldMemoryProjection(input.projection);
  verifyWorldSnapshot(input.snapshot);
  assertSafeRef(input.requestedBranchRef, 'fork request.requestedBranchRef');
  assertSafeRef(input.formedByParticipantRef, 'fork request.formedByParticipantRef');
  assertSafeRef(input.purposeRef, 'fork request.purposeRef');
  assertUniqueSafeRefs(input.assumptionRefs, 'fork request.assumptionRefs');

  if (input.formedByParticipantRef !== input.projection.viewerParticipantRef) {
    throw new TypeError('private rehearsal fork requester must be the projection viewer');
  }
  if (input.requestedBranchRef === input.projection.sourceBranchRef) {
    throw new TypeError('private rehearsal fork must request a fresh branchRef');
  }
  if (
    input.snapshot.snapshotRef !== input.projection.sourceSnapshotRef ||
    input.snapshot.snapshotSha256 !== input.projection.sourceSnapshotSha256 ||
    input.snapshot.timelineRef !== input.projection.sourceTimelineRef ||
    input.snapshot.branchRef !== input.projection.sourceBranchRef ||
    input.snapshot.tick !== input.projection.toTick
  ) {
    throw new TypeError('fork request snapshot does not match source projection');
  }

  const body = {
    schemaVersion: WORLD_MEMORY_SCHEMA.forkRequest,
    forkRequestRef: `world-memory.fork-request.${hashCanonical({
      projection: input.projection.projectionSha256,
      branch: input.requestedBranchRef,
      formedBy: input.formedByParticipantRef,
      purpose: input.purposeRef,
      assumptions: input.assumptionRefs
    }).slice(0, 32)}`,
    sourceProjectionRef: input.projection.projectionRef,
    sourceProjectionSha256: input.projection.projectionSha256,
    sourceSnapshotRef: input.snapshot.snapshotRef,
    sourceSnapshotSha256: input.snapshot.snapshotSha256,
    sourceBranchRef: input.projection.sourceBranchRef,
    requestedBranchRef: input.requestedBranchRef,
    requestedBranchClass: 'PRIVATE_REHEARSAL',
    formedByParticipantRef: input.formedByParticipantRef,
    purposeRef: input.purposeRef,
    assumptionRefs: [...input.assumptionRefs],
    requestedPrivacyClass: 'PARTICIPANT_PRIVATE',
    requestOnly: true,
    forkEffectPerformed: false,
    sourceHistoryMutation: false,
    modelReinference: false,
    worldEffectPerformed: false
  };
  return frozenCanonical({ ...body, forkRequestSha256: hashCanonical(body) });
}

export function verifyPrivateRehearsalForkRequest(request, {
  projection = null,
  snapshot = null
} = {}) {
  assertPlainObject(request, 'private rehearsal fork request');
  assertExactKeys(request, [
    'schemaVersion', 'forkRequestRef', 'sourceProjectionRef',
    'sourceProjectionSha256', 'sourceSnapshotRef', 'sourceSnapshotSha256',
    'sourceBranchRef', 'requestedBranchRef', 'requestedBranchClass',
    'formedByParticipantRef', 'purposeRef', 'assumptionRefs',
    'requestedPrivacyClass', 'requestOnly', 'forkEffectPerformed',
    'sourceHistoryMutation', 'modelReinference', 'worldEffectPerformed',
    'forkRequestSha256'
  ], 'private rehearsal fork request');
  if (request.schemaVersion !== WORLD_MEMORY_SCHEMA.forkRequest) {
    throw new TypeError('private rehearsal fork request schema mismatch');
  }
  for (const [label, value] of [
    ['forkRequestRef', request.forkRequestRef],
    ['sourceProjectionRef', request.sourceProjectionRef],
    ['sourceSnapshotRef', request.sourceSnapshotRef],
    ['sourceBranchRef', request.sourceBranchRef],
    ['requestedBranchRef', request.requestedBranchRef],
    ['formedByParticipantRef', request.formedByParticipantRef],
    ['purposeRef', request.purposeRef]
  ]) assertSafeRef(value, `fork request.${label}`);
  assertSha256(request.sourceProjectionSha256, 'fork request.sourceProjectionSha256');
  assertSha256(request.sourceSnapshotSha256, 'fork request.sourceSnapshotSha256');
  assertUniqueSafeRefs(request.assumptionRefs, 'fork request.assumptionRefs');
  if (request.requestedBranchClass !== 'PRIVATE_REHEARSAL') {
    throw new TypeError('fork request must remain PRIVATE_REHEARSAL');
  }
  if (request.requestedPrivacyClass !== 'PARTICIPANT_PRIVATE') {
    throw new TypeError('private rehearsal fork must remain participant-private');
  }
  if (request.requestedBranchRef === request.sourceBranchRef) {
    throw new TypeError('private rehearsal fork must use a fresh branchRef');
  }
  if (
    request.requestOnly !== true ||
    request.forkEffectPerformed !== false ||
    request.sourceHistoryMutation !== false ||
    request.modelReinference !== false ||
    request.worldEffectPerformed !== false
  ) {
    throw new TypeError('fork request must remain request-only and effect-free');
  }
  rejectHiddenReasoning(request, 'private rehearsal fork request');
  assertSha256(request.forkRequestSha256, 'fork request.forkRequestSha256');
  const { forkRequestSha256, ...body } = request;
  if (hashCanonical(body) !== forkRequestSha256) throw new TypeError('fork request digest mismatch');

  if (projection !== null || snapshot !== null) {
    if (projection === null || snapshot === null) {
      throw new TypeError('fork request contextual verification requires projection and snapshot together');
    }
    verifyWorldMemoryProjection(projection);
    verifyWorldSnapshot(snapshot);
    if (
      request.sourceProjectionRef !== projection.projectionRef ||
      request.sourceProjectionSha256 !== projection.projectionSha256 ||
      request.sourceSnapshotRef !== snapshot.snapshotRef ||
      request.sourceSnapshotSha256 !== snapshot.snapshotSha256 ||
      request.sourceBranchRef !== projection.sourceBranchRef ||
      request.formedByParticipantRef !== projection.viewerParticipantRef ||
      snapshot.timelineRef !== projection.sourceTimelineRef ||
      snapshot.branchRef !== projection.sourceBranchRef ||
      snapshot.tick !== projection.toTick
    ) {
      throw new TypeError('fork request source context mismatch');
    }
  }
  return request;
}

export function formSavedMomentDescriptor(input) {
  assertExactKeys(input, [
    'projection', 'chronicle', 'motionWindows', 'fromTick', 'toTick',
    'includedEventRefs', 'includedMotionWindowRefs', 'purposeRef',
    'requestedRetentionClass', 'requestedStorageIntent'
  ], 'saved moment input');
  verifyWorldMemoryProjection(input.projection, {
    chronicle: input.chronicle,
    snapshot: input.chronicleSnapshot ?? undefined,
    motionWindows: input.motionWindows
  });
}
