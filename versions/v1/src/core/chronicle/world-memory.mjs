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
  return normalized.sort((left, right) =>
    (left.fromTick - right.fromTick) ||
    (left.toTick - right.toTick) ||
    left.windowRef.localeCompare(right.windowRef, 'en')
  );
}

function resolveProjectionEvidence({
  chronicle,
  snapshot,
  fromTick,
  toTick,
  includedEventRefs,
  includedDecisionRefs,
  includedMotionWindows,
  privacyClass,
  viewerParticipantRef
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
    if (
      event.privacyClass === 'PARTICIPANT_PRIVATE' &&
      event.actorRef !== viewerParticipantRef &&
      event.payload?.deliveredToRef !== viewerParticipantRef
    ) {
      throw new TypeError('projection cannot include another participant private Chronicle event');
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
    if (
      window.privacyClass === 'PARTICIPANT_PRIVATE' &&
      window.participantRef !== viewerParticipantRef
    ) {
      throw new TypeError('projection cannot include another participant private motion window');
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
    privacyClass: input.privacyClass,
    viewerParticipantRef: input.viewerParticipantRef
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
      privacyClass: projection.privacyClass,
      viewerParticipantRef: projection.viewerParticipantRef
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
    'projection', 'chronicle', 'snapshot', 'motionWindows', 'requestedBranchRef',
    'formedByParticipantRef', 'purposeRef', 'assumptionRefs'
  ], 'private rehearsal fork request input');
  verifyWorldMemoryProjection(input.projection, {
    chronicle: input.chronicle,
    snapshot: input.snapshot,
    motionWindows: input.motionWindows
  });
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
  chronicle = null,
  snapshot = null,
  motionWindows = null
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

  const contextual =
    projection !== null || chronicle !== null || snapshot !== null || motionWindows !== null;
  if (contextual) {
    if (projection === null || chronicle === null || snapshot === null || motionWindows === null) {
      throw new TypeError('fork request contextual verification requires projection, Chronicle, snapshot and motionWindows together');
    }
    verifyWorldMemoryProjection(projection, { chronicle, snapshot, motionWindows });
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


function resolveSavedMomentEvidence({
  projection,
  chronicle,
  snapshot,
  motionWindows,
  fromTick,
  toTick,
  includedEventRefs,
  includedMotionWindowRefs
}) {
  verifyWorldMemoryProjection(projection, { chronicle, snapshot, motionWindows });
  assertNonNegativeInteger(fromTick, 'saved moment.fromTick');
  assertNonNegativeInteger(toTick, 'saved moment.toTick');
  if (toTick < fromTick) throw new TypeError('saved moment toTick must be >= fromTick');
  if (fromTick < projection.fromTick || toTick > projection.toTick) {
    throw new TypeError('saved moment interval must remain inside source projection');
  }

  assertUniqueSafeRefs(includedEventRefs, 'saved moment.includedEventRefs');
  assertUniqueSafeRefs(includedMotionWindowRefs, 'saved moment.includedMotionWindowRefs');
  if (!includedEventRefs.length && !includedMotionWindowRefs.length) {
    throw new TypeError('saved moment requires at least one bounded evidence ref');
  }
  if (!subsetOf(includedEventRefs, projection.includedEventRefs)) {
    throw new TypeError('saved moment event refs must be a subset of source projection');
  }
  if (!subsetOf(includedMotionWindowRefs, projection.includedMotionWindowRefs)) {
    throw new TypeError('saved moment motion refs must be a subset of source projection');
  }

  const eventMap = projectionEventMap(chronicle);
  for (const eventRef of includedEventRefs) {
    const event = eventMap.get(eventRef);
    if (!event || event.tick < fromTick || event.tick > toTick) {
      throw new TypeError('saved moment event evidence falls outside selected interval');
    }
  }

  const motionMap = new Map(normalizeMotionWindows(motionWindows).map((window) => [window.windowRef, window]));
  for (const windowRef of includedMotionWindowRefs) {
    const window = motionMap.get(windowRef);
    if (!window || window.fromTick < fromTick || window.toTick > toTick) {
      throw new TypeError('saved moment motion evidence falls outside selected interval');
    }
  }
  return true;
}

export function formSavedMomentDescriptor(input) {
  assertExactKeys(input, [
    'projection', 'chronicle', 'snapshot', 'motionWindows', 'fromTick', 'toTick',
    'includedEventRefs', 'includedMotionWindowRefs', 'purposeRef',
    'requestedRetentionClass', 'requestedStorageIntent'
  ], 'saved moment input');
  resolveSavedMomentEvidence({
    projection: input.projection,
    chronicle: input.chronicle,
    snapshot: input.snapshot,
    motionWindows: input.motionWindows,
    fromTick: input.fromTick,
    toTick: input.toTick,
    includedEventRefs: input.includedEventRefs,
    includedMotionWindowRefs: input.includedMotionWindowRefs
  });
  assertSafeRef(input.purposeRef, 'saved moment.purposeRef');
  if (input.requestedRetentionClass !== 'EXPLICIT_SAVED_MOMENT') {
    throw new TypeError('saved moment may request only EXPLICIT_SAVED_MOMENT retention');
  }
  if (input.requestedStorageIntent !== 'LOCAL_PRIVATE_ONLY') {
    throw new TypeError('saved moment storage intent must remain LOCAL_PRIVATE_ONLY');
  }

  const body = {
    schemaVersion: WORLD_MEMORY_SCHEMA.savedMoment,
    savedMomentRef: 'world-memory.saved-moment.' + hashCanonical({
      projection: input.projection.projectionSha256,
      fromTick: input.fromTick,
      toTick: input.toTick,
      eventRefs: input.includedEventRefs,
      motionRefs: input.includedMotionWindowRefs,
      purposeRef: input.purposeRef
    }).slice(0, 32),
    sourceProjectionRef: input.projection.projectionRef,
    sourceProjectionSha256: input.projection.projectionSha256,
    fromTick: input.fromTick,
    toTick: input.toTick,
    includedEventRefs: [...input.includedEventRefs],
    includedMotionWindowRefs: [...input.includedMotionWindowRefs],
    purposeRef: input.purposeRef,
    requestedRetentionClass: input.requestedRetentionClass,
    requestedStorageIntent: input.requestedStorageIntent,
    wholeSessionRetentionRequested: false,
    homeWritePerformed: false,
    memoryWritePerformed: false,
    vaultCommitPerformed: false,
    persistentMemoryPromotionPerformed: false
  };
  return frozenCanonical({ ...body, savedMomentSha256: hashCanonical(body) });
}

export function verifySavedMomentDescriptor(moment, {
  projection = null,
  chronicle = null,
  snapshot = null,
  motionWindows = null
} = {}) {
  assertPlainObject(moment, 'saved moment');
  assertExactKeys(moment, [
    'schemaVersion', 'savedMomentRef', 'sourceProjectionRef',
    'sourceProjectionSha256', 'fromTick', 'toTick', 'includedEventRefs',
    'includedMotionWindowRefs', 'purposeRef', 'requestedRetentionClass',
    'requestedStorageIntent', 'wholeSessionRetentionRequested',
    'homeWritePerformed', 'memoryWritePerformed', 'vaultCommitPerformed',
    'persistentMemoryPromotionPerformed', 'savedMomentSha256'
  ], 'saved moment');
  if (moment.schemaVersion !== WORLD_MEMORY_SCHEMA.savedMoment) {
    throw new TypeError('saved moment schema mismatch');
  }
  assertSafeRef(moment.savedMomentRef, 'saved moment.savedMomentRef');
  assertSafeRef(moment.sourceProjectionRef, 'saved moment.sourceProjectionRef');
  assertSha256(moment.sourceProjectionSha256, 'saved moment.sourceProjectionSha256');
  assertNonNegativeInteger(moment.fromTick, 'saved moment.fromTick');
  assertNonNegativeInteger(moment.toTick, 'saved moment.toTick');
  if (moment.toTick < moment.fromTick) throw new TypeError('saved moment toTick must be >= fromTick');
  assertUniqueSafeRefs(moment.includedEventRefs, 'saved moment.includedEventRefs');
  assertUniqueSafeRefs(moment.includedMotionWindowRefs, 'saved moment.includedMotionWindowRefs');
  if (!moment.includedEventRefs.length && !moment.includedMotionWindowRefs.length) {
    throw new TypeError('saved moment requires bounded evidence');
  }
  assertSafeRef(moment.purposeRef, 'saved moment.purposeRef');
  if (moment.requestedRetentionClass !== 'EXPLICIT_SAVED_MOMENT') {
    throw new TypeError('saved moment retention class mismatch');
  }
  if (moment.requestedStorageIntent !== 'LOCAL_PRIVATE_ONLY') {
    throw new TypeError('saved moment storage intent mismatch');
  }
  if (
    moment.wholeSessionRetentionRequested !== false ||
    moment.homeWritePerformed !== false ||
    moment.memoryWritePerformed !== false ||
    moment.vaultCommitPerformed !== false ||
    moment.persistentMemoryPromotionPerformed !== false
  ) {
    throw new TypeError('saved moment descriptor must not claim storage/promotion effects');
  }
  rejectHiddenReasoning(moment, 'saved moment');
  assertSha256(moment.savedMomentSha256, 'saved moment.savedMomentSha256');
  const { savedMomentSha256, ...body } = moment;
  if (hashCanonical(body) !== savedMomentSha256) throw new TypeError('saved moment digest mismatch');

  const contextual = projection !== null || chronicle !== null || snapshot !== null || motionWindows !== null;
  if (contextual) {
    if (projection === null || chronicle === null || snapshot === null || motionWindows === null) {
      throw new TypeError('saved moment contextual verification requires projection, Chronicle, snapshot and motionWindows together');
    }
    resolveSavedMomentEvidence({
      projection,
      chronicle,
      snapshot,
      motionWindows,
      fromTick: moment.fromTick,
      toTick: moment.toTick,
      includedEventRefs: moment.includedEventRefs,
      includedMotionWindowRefs: moment.includedMotionWindowRefs
    });
    if (
      moment.sourceProjectionRef !== projection.projectionRef ||
      moment.sourceProjectionSha256 !== projection.projectionSha256
    ) {
      throw new TypeError('saved moment source projection mismatch');
    }
  }
  return moment;
}

export function formWorldMemoryPermissionRequest(input) {
  assertExactKeys(input, [
    'projection', 'chronicle', 'snapshot', 'motionWindows',
    'requesterParticipantRef', 'subjectParticipantRefs',
    'requestedCapabilityRefs', 'purposeRef', 'requestedAudienceRefs',
    'requestedRetentionClass', 'externalPolicyOwnerRef'
  ], 'World Memory permission request input');
  verifyWorldMemoryProjection(input.projection, {
    chronicle: input.chronicle,
    snapshot: input.snapshot,
    motionWindows: input.motionWindows
  });
  assertSafeRef(input.requesterParticipantRef, 'permission request.requesterParticipantRef');
  if (input.requesterParticipantRef !== input.projection.viewerParticipantRef) {
    throw new TypeError('permission requester must be the World Memory projection viewer');
  }
  assertUniqueSafeRefs(input.subjectParticipantRefs, 'permission request.subjectParticipantRefs', { allowEmpty: false });
  assertCapabilities(input.requestedCapabilityRefs, 'permission request.requestedCapabilityRefs');
  assertSafeRef(input.purposeRef, 'permission request.purposeRef');
  assertUniqueSafeRefs(input.requestedAudienceRefs, 'permission request.requestedAudienceRefs');
  assertRetention(input.requestedRetentionClass, 'permission request.requestedRetentionClass');
  assertSafeRef(input.externalPolicyOwnerRef, 'permission request.externalPolicyOwnerRef');

  const requiresAudience =
    input.requestedCapabilityRefs.includes('capability.world-memory.fork-shared') ||
    input.requestedCapabilityRefs.includes('capability.world-memory.redistribute');
  if (requiresAudience && input.requestedAudienceRefs.length === 0) {
    throw new TypeError('shared/redistribution permission request requires an explicit audience');
  }

  const body = {
    schemaVersion: WORLD_MEMORY_SCHEMA.permissionRequest,
    permissionRequestRef: 'world-memory.permission-request.' + hashCanonical({
      projection: input.projection.projectionSha256,
      requester: input.requesterParticipantRef,
      subjects: input.subjectParticipantRefs,
      capabilities: input.requestedCapabilityRefs,
      purpose: input.purposeRef,
      audience: input.requestedAudienceRefs,
      retention: input.requestedRetentionClass,
      owner: input.externalPolicyOwnerRef
    }).slice(0, 32),
    requesterParticipantRef: input.requesterParticipantRef,
    subjectParticipantRefs: [...input.subjectParticipantRefs],
    sourceProjectionRef: input.projection.projectionRef,
    sourceProjectionSha256: input.projection.projectionSha256,
    requestedCapabilityRefs: [...input.requestedCapabilityRefs],
    purposeRef: input.purposeRef,
    requestedAudienceRefs: [...input.requestedAudienceRefs],
    requestedRetentionClass: input.requestedRetentionClass,
    externalPolicyOwnerRef: input.externalPolicyOwnerRef,
    externalDecisionRequired: true,
    authorizationPerformed: false,
    relationshipMutationPerformed: false,
    homeWritePerformed: false,
    memoryWritePerformed: false,
    networkDeliveryPerformed: false
  };
  return frozenCanonical({ ...body, permissionRequestSha256: hashCanonical(body) });
}

export function verifyWorldMemoryPermissionRequest(request, {
  projection = null,
  chronicle = null,
  snapshot = null,
  motionWindows = null
} = {}) {
  assertPlainObject(request, 'World Memory permission request');
  assertExactKeys(request, [
    'schemaVersion', 'permissionRequestRef', 'requesterParticipantRef',
    'subjectParticipantRefs', 'sourceProjectionRef', 'sourceProjectionSha256',
    'requestedCapabilityRefs', 'purposeRef', 'requestedAudienceRefs',
    'requestedRetentionClass', 'externalPolicyOwnerRef',
    'externalDecisionRequired', 'authorizationPerformed',
    'relationshipMutationPerformed', 'homeWritePerformed',
    'memoryWritePerformed', 'networkDeliveryPerformed',
    'permissionRequestSha256'
  ], 'World Memory permission request');
  if (request.schemaVersion !== WORLD_MEMORY_SCHEMA.permissionRequest) {
    throw new TypeError('World Memory permission request schema mismatch');
  }
  assertSafeRef(request.permissionRequestRef, 'permission request.permissionRequestRef');
  assertSafeRef(request.requesterParticipantRef, 'permission request.requesterParticipantRef');
  assertUniqueSafeRefs(request.subjectParticipantRefs, 'permission request.subjectParticipantRefs', { allowEmpty: false });
  assertSafeRef(request.sourceProjectionRef, 'permission request.sourceProjectionRef');
  assertSha256(request.sourceProjectionSha256, 'permission request.sourceProjectionSha256');
  assertCapabilities(request.requestedCapabilityRefs, 'permission request.requestedCapabilityRefs');
  assertSafeRef(request.purposeRef, 'permission request.purposeRef');
  assertUniqueSafeRefs(request.requestedAudienceRefs, 'permission request.requestedAudienceRefs');
  assertRetention(request.requestedRetentionClass, 'permission request.requestedRetentionClass');
  assertSafeRef(request.externalPolicyOwnerRef, 'permission request.externalPolicyOwnerRef');
  const requiresAudience =
    request.requestedCapabilityRefs.includes('capability.world-memory.fork-shared') ||
    request.requestedCapabilityRefs.includes('capability.world-memory.redistribute');
  if (requiresAudience && request.requestedAudienceRefs.length === 0) {
    throw new TypeError('shared/redistribution permission request requires an explicit audience');
  }
  if (
    request.externalDecisionRequired !== true ||
    request.authorizationPerformed !== false ||
    request.relationshipMutationPerformed !== false ||
    request.homeWritePerformed !== false ||
    request.memoryWritePerformed !== false ||
    request.networkDeliveryPerformed !== false
  ) {
    throw new TypeError('permission request must remain an external-decision request with no local effects');
  }
  rejectHiddenReasoning(request, 'World Memory permission request');
  assertSha256(request.permissionRequestSha256, 'permission request.permissionRequestSha256');
  const { permissionRequestSha256, ...body } = request;
  if (hashCanonical(body) !== permissionRequestSha256) throw new TypeError('permission request digest mismatch');

  const contextual =
    projection !== null || chronicle !== null || snapshot !== null || motionWindows !== null;
  if (contextual) {
    if (projection === null || chronicle === null || snapshot === null || motionWindows === null) {
      throw new TypeError('permission request contextual verification requires projection, Chronicle, snapshot and motionWindows together');
    }
    verifyWorldMemoryProjection(projection, { chronicle, snapshot, motionWindows });
    if (
      request.requesterParticipantRef !== projection.viewerParticipantRef ||
      request.sourceProjectionRef !== projection.projectionRef ||
      request.sourceProjectionSha256 !== projection.projectionSha256
    ) {
      throw new TypeError('permission request source projection mismatch');
    }
  }
  return request;
}

function validateDecisionAgainstRequest(decision, request, {
  projection,
  chronicle,
  snapshot,
  motionWindows
}) {
  verifyWorldMemoryPermissionRequest(request, { projection, chronicle, snapshot, motionWindows });
  verifyExternalPolicyDecision(decision);
  if (
    decision.permissionRequestRef !== request.permissionRequestRef ||
    decision.permissionRequestSha256 !== request.permissionRequestSha256 ||
    decision.policyOwnerRef !== request.externalPolicyOwnerRef
  ) {
    throw new TypeError('external policy decision does not bind the exact permission request');
  }
  if (!subsetOf(decision.grantedCapabilityRefs, request.requestedCapabilityRefs)) {
    throw new TypeError('external policy decision grants an unrequested capability');
  }
  if (!subsetOf(decision.audienceRefs, request.requestedAudienceRefs)) {
    throw new TypeError('external policy decision grants an unrequested audience');
  }

  if (decision.decisionClass === 'ALLOW') {
    if (
      !sameSet(decision.grantedCapabilityRefs, request.requestedCapabilityRefs) ||
      !sameSet(decision.audienceRefs, request.requestedAudienceRefs)
    ) {
      throw new TypeError('ALLOW must grant the exact requested capability/audience set');
    }
  } else if (decision.decisionClass === 'NARROW') {
    if (decision.grantedCapabilityRefs.length === 0) {
      throw new TypeError('NARROW must retain at least one requested capability');
    }
    if (
      sameSet(decision.grantedCapabilityRefs, request.requestedCapabilityRefs) &&
      sameSet(decision.audienceRefs, request.requestedAudienceRefs)
    ) {
      throw new TypeError('NARROW must actually narrow capability or audience');
    }
  } else {
    if (
      decision.grantedCapabilityRefs.length !== 0 ||
      decision.audienceRefs.length !== 0 ||
      decision.consentRefOrNull !== null
    ) {
      throw new TypeError('DEFER/DENY/REVOKE must not grant capability, audience or consent');
    }
  }

  const externalAudience = decision.audienceRefs.some((ref) => ref !== request.requesterParticipantRef);
  const sharedCapability =
    decision.grantedCapabilityRefs.includes('capability.world-memory.fork-shared') ||
    decision.grantedCapabilityRefs.includes('capability.world-memory.redistribute');
  if (
    (decision.decisionClass === 'ALLOW' || decision.decisionClass === 'NARROW') &&
    (externalAudience || sharedCapability) &&
    decision.consentRefOrNull === null
  ) {
    throw new TypeError('externally shared World Memory authorization requires explicit consent evidence');
  }
  return true;
}

export function formSyntheticExternalPolicyDecision(input) {
  assertExactKeys(input, [
    'request', 'projection', 'chronicle', 'snapshot', 'motionWindows',
    'policyDecisionRef', 'decisionClass',
    'grantedCapabilityRefs', 'audienceRefs',
    'currentnessRef', 'consentRefOrNull'
  ], 'synthetic external policy decision input');
  verifyWorldMemoryPermissionRequest(input.request, {
    projection: input.projection,
    chronicle: input.chronicle,
    snapshot: input.snapshot,
    motionWindows: input.motionWindows
  });
  assertSafeRef(input.policyDecisionRef, 'policy decision.policyDecisionRef');
  if (!POLICY_DECISION_CLASS.has(input.decisionClass)) {
    throw new TypeError('policy decision class is unsupported');
  }
  assertCapabilities(input.grantedCapabilityRefs, 'policy decision.grantedCapabilityRefs', { allowEmpty: true });
  assertUniqueSafeRefs(input.audienceRefs, 'policy decision.audienceRefs');
  assertSafeRef(input.currentnessRef, 'policy decision.currentnessRef');
  assertNullableSafeRef(input.consentRefOrNull, 'policy decision.consentRefOrNull');

  const body = {
    schemaVersion: WORLD_MEMORY_SCHEMA.policyDecision,
    evidenceClass: 'SYNTHETIC_EXTERNAL_POLICY_FIXTURE',
    policyDecisionRef: input.policyDecisionRef,
    policyOwnerRef: input.request.externalPolicyOwnerRef,
    permissionRequestRef: input.request.permissionRequestRef,
    permissionRequestSha256: input.request.permissionRequestSha256,
    decisionClass: input.decisionClass,
    grantedCapabilityRefs: [...input.grantedCapabilityRefs],
    audienceRefs: [...input.audienceRefs],
    currentnessRef: input.currentnessRef,
    consentRefOrNull: input.consentRefOrNull,
    relationshipMutationPerformed: false,
    homeWritePerformed: false,
    memoryWritePerformed: false,
    networkDeliveryPerformed: false
  };
  const formed = frozenCanonical({ ...body, policyDecisionSha256: hashCanonical(body) });
  validateDecisionAgainstRequest(formed, input.request, {
    projection: input.projection,
    chronicle: input.chronicle,
    snapshot: input.snapshot,
    motionWindows: input.motionWindows
  });
  return formed;
}

export function verifyExternalPolicyDecision(decision) {
  assertPlainObject(decision, 'external policy decision');
  assertExactKeys(decision, [
    'schemaVersion', 'evidenceClass', 'policyDecisionRef', 'policyOwnerRef',
    'permissionRequestRef', 'permissionRequestSha256', 'decisionClass',
    'grantedCapabilityRefs', 'audienceRefs', 'currentnessRef',
    'consentRefOrNull', 'relationshipMutationPerformed',
    'homeWritePerformed', 'memoryWritePerformed', 'networkDeliveryPerformed',
    'policyDecisionSha256'
  ], 'external policy decision');
  if (decision.schemaVersion !== WORLD_MEMORY_SCHEMA.policyDecision) {
    throw new TypeError('external policy decision schema mismatch');
  }
  if (decision.evidenceClass !== 'SYNTHETIC_EXTERNAL_POLICY_FIXTURE') {
    throw new TypeError('07E accepts only synthetic external-policy fixture evidence');
  }
  assertSafeRef(decision.policyDecisionRef, 'policy decision.policyDecisionRef');
  assertSafeRef(decision.policyOwnerRef, 'policy decision.policyOwnerRef');
  assertSafeRef(decision.permissionRequestRef, 'policy decision.permissionRequestRef');
  assertSha256(decision.permissionRequestSha256, 'policy decision.permissionRequestSha256');
  if (!POLICY_DECISION_CLASS.has(decision.decisionClass)) {
    throw new TypeError('policy decision class is unsupported');
  }
  assertCapabilities(decision.grantedCapabilityRefs, 'policy decision.grantedCapabilityRefs', { allowEmpty: true });
  assertUniqueSafeRefs(decision.audienceRefs, 'policy decision.audienceRefs');
  assertSafeRef(decision.currentnessRef, 'policy decision.currentnessRef');
  assertNullableSafeRef(decision.consentRefOrNull, 'policy decision.consentRefOrNull');
  if (
    decision.relationshipMutationPerformed !== false ||
    decision.homeWritePerformed !== false ||
    decision.memoryWritePerformed !== false ||
    decision.networkDeliveryPerformed !== false
  ) {
    throw new TypeError('external policy evidence must not claim VexLife/Home/network effects');
  }
  rejectHiddenReasoning(decision, 'external policy decision');
  assertSha256(decision.policyDecisionSha256, 'policy decision.policyDecisionSha256');
  const { policyDecisionSha256, ...body } = decision;
  if (hashCanonical(body) !== policyDecisionSha256) throw new TypeError('external policy decision digest mismatch');
  return decision;
}

export function evaluateWorldMemoryAuthorization({
  request,
  decision,
  projection,
  chronicle,
  snapshot,
  motionWindows
}) {
  validateDecisionAgainstRequest(decision, request, {
    projection,
    chronicle,
    snapshot,
    motionWindows
  });

  let authorizationClass;
  if (decision.decisionClass === 'ALLOW' || decision.decisionClass === 'NARROW') {
    authorizationClass = 'AUTHORIZED';
  } else if (decision.decisionClass === 'DEFER') {
    authorizationClass = 'DEFERRED';
  } else if (decision.decisionClass === 'REVOKE') {
    authorizationClass = 'REVOKED';
  } else {
    authorizationClass = 'DENIED';
  }

  const effectiveCapabilityRefs = authorizationClass === 'AUTHORIZED'
    ? [...decision.grantedCapabilityRefs]
    : [];
  const effectiveAudienceRefs = authorizationClass === 'AUTHORIZED'
    ? [...decision.audienceRefs]
    : [];
  const consentRefOrNull = authorizationClass === 'AUTHORIZED'
    ? decision.consentRefOrNull
    : null;

  const body = {
    schemaVersion: WORLD_MEMORY_SCHEMA.authorization,
    authorizationRef: 'world-memory.authorization.' + hashCanonical({
      request: request.permissionRequestSha256,
      decision: decision.policyDecisionSha256
    }).slice(0, 32),
    permissionRequestRef: request.permissionRequestRef,
    permissionRequestSha256: request.permissionRequestSha256,
    policyDecisionRef: decision.policyDecisionRef,
    policyDecisionSha256: decision.policyDecisionSha256,
    sourceProjectionRef: request.sourceProjectionRef,
    sourceProjectionSha256: request.sourceProjectionSha256,
    authorizationClass,
    effectiveCapabilityRefs,
    effectiveAudienceRefs,
    consentRefOrNull,
    historyMutation: false,
    forkEffectPerformed: false,
    relationshipMutationPerformed: false,
    homeWritePerformed: false,
    memoryWritePerformed: false,
    networkDeliveryPerformed: false,
    modelInvocationPerformed: false,
    publicationPerformed: false
  };
  return frozenCanonical({ ...body, authorizationSha256: hashCanonical(body) });
}

export function verifyWorldMemoryAuthorization(authorization, {
  request = null,
  decision = null,
  projection = null,
  chronicle = null,
  snapshot = null,
  motionWindows = null
} = {}) {
  assertPlainObject(authorization, 'World Memory authorization');
  assertExactKeys(authorization, [
    'schemaVersion', 'authorizationRef', 'permissionRequestRef',
    'permissionRequestSha256', 'policyDecisionRef', 'policyDecisionSha256',
    'sourceProjectionRef', 'sourceProjectionSha256', 'authorizationClass',
    'effectiveCapabilityRefs', 'effectiveAudienceRefs', 'consentRefOrNull',
    'historyMutation', 'forkEffectPerformed', 'relationshipMutationPerformed',
    'homeWritePerformed', 'memoryWritePerformed', 'networkDeliveryPerformed',
    'modelInvocationPerformed', 'publicationPerformed', 'authorizationSha256'
  ], 'World Memory authorization');
  if (authorization.schemaVersion !== WORLD_MEMORY_SCHEMA.authorization) {
    throw new TypeError('World Memory authorization schema mismatch');
  }
  for (const [label, value] of [
    ['authorizationRef', authorization.authorizationRef],
    ['permissionRequestRef', authorization.permissionRequestRef],
    ['policyDecisionRef', authorization.policyDecisionRef],
    ['sourceProjectionRef', authorization.sourceProjectionRef]
  ]) assertSafeRef(value, 'authorization.' + label);
  assertSha256(authorization.permissionRequestSha256, 'authorization.permissionRequestSha256');
  assertSha256(authorization.policyDecisionSha256, 'authorization.policyDecisionSha256');
  assertSha256(authorization.sourceProjectionSha256, 'authorization.sourceProjectionSha256');
  if (!AUTHORIZATION_CLASS.has(authorization.authorizationClass)) {
    throw new TypeError('World Memory authorization class is unsupported');
  }
  assertCapabilities(authorization.effectiveCapabilityRefs, 'authorization.effectiveCapabilityRefs', { allowEmpty: true });
  assertUniqueSafeRefs(authorization.effectiveAudienceRefs, 'authorization.effectiveAudienceRefs');
  assertNullableSafeRef(authorization.consentRefOrNull, 'authorization.consentRefOrNull');
  if (
    authorization.authorizationClass !== 'AUTHORIZED' &&
    (
      authorization.effectiveCapabilityRefs.length !== 0 ||
      authorization.effectiveAudienceRefs.length !== 0 ||
      authorization.consentRefOrNull !== null
    )
  ) {
    throw new TypeError('non-authorized result must not retain effective grants');
  }
  if (
    authorization.historyMutation !== false ||
    authorization.forkEffectPerformed !== false ||
    authorization.relationshipMutationPerformed !== false ||
    authorization.homeWritePerformed !== false ||
    authorization.memoryWritePerformed !== false ||
    authorization.networkDeliveryPerformed !== false ||
    authorization.modelInvocationPerformed !== false ||
    authorization.publicationPerformed !== false
  ) {
    throw new TypeError('World Memory authorization result must remain effect-free');
  }
  rejectHiddenReasoning(authorization, 'World Memory authorization');
  assertSha256(authorization.authorizationSha256, 'authorization.authorizationSha256');
  const { authorizationSha256, ...body } = authorization;
  if (hashCanonical(body) !== authorizationSha256) throw new TypeError('World Memory authorization digest mismatch');

  const contextual =
    request !== null || decision !== null || projection !== null ||
    chronicle !== null || snapshot !== null || motionWindows !== null;
  if (contextual) {
    if (
      request === null || decision === null || projection === null ||
      chronicle === null || snapshot === null || motionWindows === null
    ) {
      throw new TypeError('authorization contextual verification requires request, decision, projection, Chronicle, snapshot and motionWindows together');
    }
    const expected = evaluateWorldMemoryAuthorization({
      request,
      decision,
      projection,
      chronicle,
      snapshot,
      motionWindows
    });
    if (expected.authorizationSha256 !== authorization.authorizationSha256) {
      throw new TypeError('World Memory authorization request/decision context mismatch');
    }
  }
  return authorization;
}
