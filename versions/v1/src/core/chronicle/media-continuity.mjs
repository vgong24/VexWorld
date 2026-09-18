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
  verifyWorldMemoryAuthorization,
  verifyWorldMemoryProjection
} from './world-memory.mjs';

export const MEDIA_CONTINUITY_SCHEMA = Object.freeze({
  shot: 'vexworld.cinematic-shot/v1',
  sequence: 'vexworld.cinematic-sequence/v1',
  renderRequest: 'vexworld.cinematic-render-request/v1',
  frameEvidence: 'vexworld.presentation-frame-evidence/v1',
  captureManifest: 'vexworld.media-capture-manifest/v1',
  exportRequest: 'vexworld.media-export-request/v1'
});

const PRIVACY_RANK = new Map([
  ['PUBLIC_WORLD', 0],
  ['PARTY_SHARED', 1],
  ['PARTICIPANT_PRIVATE', 2]
]);
const FRAMING = new Set(['WIDE', 'MEDIUM', 'CLOSE', 'OVER_SHOULDER', 'FIRST_PERSON', 'ORBIT', 'STATIC', 'TRACKING']);
const PRESENTATION = new Set(['CINEMATIC_REPLAY', 'CINEMATIC_COMPARISON', 'CINEMATIC_BRANCH_EDIT']);
const CONTAINER = new Set(['VIDEO_STREAM_DESCRIPTOR', 'IMAGE_SEQUENCE_DESCRIPTOR', 'TIMELINE_EDIT_DESCRIPTOR']);

function nullableRef(value, label) {
  if (value !== null) assertSafeRef(value, label);
}

function same(left, right) {
  return canonicalJson(left) === canonicalJson(right);
}

function orderedSubset(values, source) {
  let cursor = 0;
  for (const value of values) {
    while (cursor < source.length && source[cursor] !== value) cursor += 1;
    if (cursor >= source.length) return false;
    cursor += 1;
  }
  return true;
}

function assertPrivacy(value, label) {
  if (!PRIVACY_RANK.has(value)) throw new TypeError(label + ' is unsupported');
}

function strictestPrivacy(values) {
  let result = 'PUBLIC_WORLD';
  for (const value of values) {
    assertPrivacy(value, 'source privacyClass');
    if (PRIVACY_RANK.get(value) > PRIVACY_RANK.get(result)) result = value;
  }
  return result;
}

function validateCameraIntent(value) {
  assertExactKeys(value, [
    'cameraRef', 'framingClass', 'subjectRefs', 'anchorRefOrNull', 'presentationTransformRef'
  ], 'cameraIntent');
  assertSafeRef(value.cameraRef, 'cameraIntent.cameraRef');
  if (!FRAMING.has(value.framingClass)) throw new TypeError('cameraIntent framingClass is unsupported');
  assertUniqueSafeRefs(value.subjectRefs, 'cameraIntent.subjectRefs', { allowEmpty: false });
  nullableRef(value.anchorRefOrNull, 'cameraIntent.anchorRefOrNull');
  assertSafeRef(value.presentationTransformRef, 'cameraIntent.presentationTransformRef');
}

function verifyProjectionContext(projection, chronicle, snapshot, motionWindows) {
  verifyWorldMemoryProjection(projection, { chronicle, snapshot, motionWindows });
}

function shotEvidence(input) {
  verifyProjectionContext(input.projection, input.chronicle, input.snapshot, input.motionWindows);
  assertNonNegativeInteger(input.fromTick, 'shot.fromTick');
  assertNonNegativeInteger(input.toTick, 'shot.toTick');
  if (input.toTick < input.fromTick) throw new TypeError('shot toTick must be >= fromTick');
  if (input.fromTick < input.projection.fromTick || input.toTick > input.projection.toTick) {
    throw new TypeError('cinematic shot interval is outside source projection');
  }
  assertUniqueSafeRefs(input.includedEventRefs, 'shot.includedEventRefs', { allowEmpty: false });
  assertUniqueSafeRefs(input.includedMotionWindowRefs, 'shot.includedMotionWindowRefs');
  validateCameraIntent(input.cameraIntent);
  assertPrivacy(input.privacyClass, 'shot.privacyClass');
  if (!PRESENTATION.has(input.presentationClass)) throw new TypeError('shot presentationClass is unsupported');
  if (!orderedSubset(input.includedEventRefs, input.projection.includedEventRefs)) {
    throw new TypeError('cinematic shot event refs must be an ordered subset of source projection');
  }
  const allowedMotion = new Set(input.projection.includedMotionWindowRefs);
  if (!input.includedMotionWindowRefs.every((ref) => allowedMotion.has(ref))) {
    throw new TypeError('cinematic shot motion refs must be a subset of source projection');
  }

  const eventByRef = new Map(input.chronicle.events.map((event) => [event.eventRef, event]));
  const motionByRef = new Map(input.motionWindows.map((window) => [window.windowRef, window]));
  const events = input.includedEventRefs.map((ref) => {
    const event = eventByRef.get(ref);
    if (!event) throw new TypeError('cinematic shot eventRef is absent from source Chronicle');
    if (event.tick < input.fromTick || event.tick > input.toTick) {
      throw new TypeError('cinematic shot eventRef falls outside shot interval');
    }
    return event;
  });
  const windows = input.includedMotionWindowRefs.map((ref) => {
    const window = motionByRef.get(ref);
    if (!window) throw new TypeError('cinematic shot motion window is absent from verified source context');
    if (window.fromTick < input.fromTick || window.toTick > input.toTick) {
      throw new TypeError('cinematic shot motion window falls outside shot interval');
    }
    return window;
  });

  const required = strictestPrivacy([
    ...events.map((event) => event.privacyClass),
    ...windows.map((window) => window.privacyClass)
  ]);
  if (PRIVACY_RANK.get(input.privacyClass) < PRIVACY_RANK.get(required)) {
    throw new TypeError('cinematic shot cannot widen source privacy');
  }

  const subjects = new Set([input.projection.viewerParticipantRef]);
  for (const event of events) {
    subjects.add(event.actorRef);
    if (typeof event.payload?.deliveredToRef === 'string') subjects.add(event.payload.deliveredToRef);
  }
  for (const window of windows) subjects.add(window.participantRef);
  for (const ref of input.cameraIntent.subjectRefs) {
    if (!subjects.has(ref)) throw new TypeError('camera subjectRef is not present in admitted source evidence');
  }

  const eventHashes = new Map(input.projection.includedEventRefs.map(
    (ref, index) => [ref, input.projection.includedEventSha256s[index]]
  ));
  const motionHashes = new Map(input.projection.includedMotionWindowRefs.map(
    (ref, index) => [ref, input.projection.includedMotionWindowSha256s[index]]
  ));
  return {
    eventSha256s: input.includedEventRefs.map((ref) => eventHashes.get(ref)),
    motionWindowSha256s: input.includedMotionWindowRefs.map((ref) => motionHashes.get(ref))
  };
}

function shotCoordinate(value) {
  return {
    projectionSha256: value.sourceProjectionSha256,
    sourceTimelineRef: value.sourceTimelineRef,
    sourceBranchRef: value.sourceBranchRef,
    sourceEventHeadSha256: value.sourceEventHeadSha256,
    sourceSnapshotSha256: value.sourceSnapshotSha256,
    fromTick: value.fromTick,
    toTick: value.toTick,
    includedEventRefs: value.includedEventRefs,
    includedMotionWindowRefs: value.includedMotionWindowRefs,
    cameraIntent: value.cameraIntent,
    privacyClass: value.privacyClass,
    presentationClass: value.presentationClass
  };
}

export function formCinematicShot(input) {
  assertExactKeys(input, [
    'projection', 'chronicle', 'snapshot', 'motionWindows',
    'fromTick', 'toTick', 'includedEventRefs', 'includedMotionWindowRefs',
    'cameraIntent', 'privacyClass', 'presentationClass'
  ], 'cinematic shot input');
  const resolved = shotEvidence(input);
  const cameraIntent = canonicalClone(input.cameraIntent);
  const body = {
    schemaVersion: MEDIA_CONTINUITY_SCHEMA.shot,
    shotRef: '',
    shotMode: 'PRESENTATION_ONLY_CINEMATIC_SHOT',
    sourceProjectionRef: input.projection.projectionRef,
    sourceProjectionSha256: input.projection.projectionSha256,
    viewerParticipantRef: input.projection.viewerParticipantRef,
    sourceTimelineRef: input.projection.sourceTimelineRef,
    sourceBranchRef: input.projection.sourceBranchRef,
    sourceEventHeadSha256: input.projection.sourceEventHeadSha256,
    sourceSnapshotRef: input.projection.sourceSnapshotRef,
    sourceSnapshotSha256: input.projection.sourceSnapshotSha256,
    fromTick: input.fromTick,
    toTick: input.toTick,
    includedEventRefs: [...input.includedEventRefs],
    includedEventSha256s: [...resolved.eventSha256s],
    includedMotionWindowRefs: [...input.includedMotionWindowRefs],
    includedMotionWindowSha256s: [...resolved.motionWindowSha256s],
    cameraIntent,
    privacyClass: input.privacyClass,
    presentationClass: input.presentationClass,
    canonicalHistoryMutation: false,
    worldStateMutation: false,
    participantExistenceInference: false,
    renderEffectPerformed: false,
    modelReinference: false,
    worldSimulationPerformed: false
  };
  body.shotRef = 'cinematic.shot.' + hashCanonical(shotCoordinate(body)).slice(0, 32);
  return frozenCanonical({ ...body, shotSha256: hashCanonical(body) });
}

export function verifyCinematicShot(shot, context = {}) {
  assertPlainObject(shot, 'cinematic shot');
  assertExactKeys(shot, [
    'schemaVersion', 'shotRef', 'shotMode', 'sourceProjectionRef', 'sourceProjectionSha256',
    'viewerParticipantRef', 'sourceTimelineRef', 'sourceBranchRef', 'sourceEventHeadSha256',
    'sourceSnapshotRef', 'sourceSnapshotSha256', 'fromTick', 'toTick', 'includedEventRefs',
    'includedEventSha256s', 'includedMotionWindowRefs', 'includedMotionWindowSha256s',
    'cameraIntent', 'privacyClass', 'presentationClass', 'canonicalHistoryMutation',
    'worldStateMutation', 'participantExistenceInference', 'renderEffectPerformed',
    'modelReinference', 'worldSimulationPerformed', 'shotSha256'
  ], 'cinematic shot');
  if (shot.schemaVersion !== MEDIA_CONTINUITY_SCHEMA.shot) throw new TypeError('cinematic shot schema mismatch');
  if (shot.shotMode !== 'PRESENTATION_ONLY_CINEMATIC_SHOT') throw new TypeError('cinematic shot mode mismatch');
  for (const [label, value] of [
    ['shotRef', shot.shotRef], ['sourceProjectionRef', shot.sourceProjectionRef],
    ['viewerParticipantRef', shot.viewerParticipantRef], ['sourceTimelineRef', shot.sourceTimelineRef],
    ['sourceBranchRef', shot.sourceBranchRef], ['sourceSnapshotRef', shot.sourceSnapshotRef]
  ]) assertSafeRef(value, 'shot.' + label);
  for (const [label, value] of [
    ['sourceProjectionSha256', shot.sourceProjectionSha256], ['sourceEventHeadSha256', shot.sourceEventHeadSha256],
    ['sourceSnapshotSha256', shot.sourceSnapshotSha256], ['shotSha256', shot.shotSha256]
  ]) assertSha256(value, 'shot.' + label);
  assertNonNegativeInteger(shot.fromTick, 'shot.fromTick');
  assertNonNegativeInteger(shot.toTick, 'shot.toTick');
  assertUniqueSafeRefs(shot.includedEventRefs, 'shot.includedEventRefs', { allowEmpty: false });
  assertUniqueSafeRefs(shot.includedMotionWindowRefs, 'shot.includedMotionWindowRefs');
  if (!Array.isArray(shot.includedEventSha256s) || shot.includedEventSha256s.length !== shot.includedEventRefs.length) {
    throw new TypeError('cinematic shot event evidence count mismatch');
  }
  if (!Array.isArray(shot.includedMotionWindowSha256s) ||
      shot.includedMotionWindowSha256s.length !== shot.includedMotionWindowRefs.length) {
    throw new TypeError('cinematic shot motion evidence count mismatch');
  }
  shot.includedEventSha256s.forEach((hash, i) => assertSha256(hash, 'shot.includedEventSha256s[' + i + ']'));
  shot.includedMotionWindowSha256s.forEach((hash, i) => assertSha256(hash, 'shot.includedMotionWindowSha256s[' + i + ']'));
  validateCameraIntent(shot.cameraIntent);
  assertPrivacy(shot.privacyClass, 'shot.privacyClass');
  if (!PRESENTATION.has(shot.presentationClass)) throw new TypeError('shot presentationClass is unsupported');
  if (
    shot.canonicalHistoryMutation !== false || shot.worldStateMutation !== false ||
    shot.participantExistenceInference !== false || shot.renderEffectPerformed !== false ||
    shot.modelReinference !== false || shot.worldSimulationPerformed !== false
  ) throw new TypeError('cinematic shot must remain presentation-only and effect-free');
  if (shot.shotRef !== 'cinematic.shot.' + hashCanonical(shotCoordinate(shot)).slice(0, 32)) {
    throw new TypeError('cinematic shot coordinate ref mismatch');
  }
  rejectHiddenReasoning(shot, 'cinematic shot');
  const { shotSha256, ...body } = shot;
  if (hashCanonical(body) !== shotSha256) throw new TypeError('cinematic shot digest mismatch');

  const contextual = ['projection', 'chronicle', 'snapshot', 'motionWindows'].some((key) => context[key] !== undefined);
  if (contextual) {
    if (['projection', 'chronicle', 'snapshot', 'motionWindows'].some((key) => context[key] === undefined)) {
      throw new TypeError('cinematic shot contextual verification requires projection, Chronicle, snapshot and motionWindows together');
    }
    const expected = formCinematicShot({
      ...context,
      fromTick: shot.fromTick,
      toTick: shot.toTick,
      includedEventRefs: shot.includedEventRefs,
      includedMotionWindowRefs: shot.includedMotionWindowRefs,
      cameraIntent: shot.cameraIntent,
      privacyClass: shot.privacyClass,
      presentationClass: shot.presentationClass
    });
    if (!same(expected, shot)) throw new TypeError('cinematic shot source context mismatch');
  }
  return shot;
}

function transition(fromShot, toShot, index) {
  const transitionClass = fromShot.sourceBranchRef === toShot.sourceBranchRef ? 'SAME_BRANCH_CUT' : 'CROSS_BRANCH_EDIT';
  const coordinate = {
    index,
    fromShotSha256: fromShot.shotSha256,
    toShotSha256: toShot.shotSha256,
    fromBranchRef: fromShot.sourceBranchRef,
    toBranchRef: toShot.sourceBranchRef,
    transitionClass
  };
  return frozenCanonical({
    transitionRef: 'cinematic.transition.' + hashCanonical(coordinate).slice(0, 32),
    fromShotRef: fromShot.shotRef,
    toShotRef: toShot.shotRef,
    fromBranchRef: fromShot.sourceBranchRef,
    toBranchRef: toShot.sourceBranchRef,
    transitionClass,
    canonicalBranchMergePerformed: false,
    canonicalHistoryMutation: false
  });
}

export function formCinematicSequence(input) {
  assertExactKeys(input, ['shots', 'sequencePurposeRef'], 'cinematic sequence input');
  if (!Array.isArray(input.shots) || input.shots.length === 0) throw new TypeError('cinematic sequence shots must be non-empty');
  input.shots.forEach((shot) => verifyCinematicShot(shot));
  assertSafeRef(input.sequencePurposeRef, 'sequencePurposeRef');
  const timelineRef = input.shots[0].sourceTimelineRef;
  if (!input.shots.every((shot) => shot.sourceTimelineRef === timelineRef)) {
    throw new TypeError('cinematic sequence cannot silently combine different timelines');
  }
  const orderedShotRefs = input.shots.map((shot) => shot.shotRef);
  const orderedShotSha256s = input.shots.map((shot) => shot.shotSha256);
  if (new Set(orderedShotRefs).size !== orderedShotRefs.length) throw new TypeError('cinematic sequence shot refs must be unique');
  const branchTransitions = [];
  for (let i = 1; i < input.shots.length; i += 1) branchTransitions.push(transition(input.shots[i - 1], input.shots[i], i - 1));
  const body = {
    schemaVersion: MEDIA_CONTINUITY_SCHEMA.sequence,
    sequenceRef: 'cinematic.sequence.' + hashCanonical({
      sequencePurposeRef: input.sequencePurposeRef,
      timelineRef,
      orderedShotSha256s
    }).slice(0, 32),
    sequencePurposeRef: input.sequencePurposeRef,
    sourceTimelineRef: timelineRef,
    orderedShotRefs,
    orderedShotSha256s,
    orderedSourceProjectionRefs: input.shots.map((shot) => shot.sourceProjectionRef),
    orderedSourceProjectionSha256s: input.shots.map((shot) => shot.sourceProjectionSha256),
    orderedSourceBranchRefs: input.shots.map((shot) => shot.sourceBranchRef),
    branchTransitions,
    continuityMode: 'EXPLICIT_BRANCH_AWARE_EDIT',
    presentationOrderOnly: true,
    editEffectPerformed: false,
    canonicalBranchMergePerformed: false,
    canonicalHistoryMutation: false
  };
  return frozenCanonical({ ...body, sequenceSha256: hashCanonical(body) });
}

export function verifyCinematicSequence(sequence, { shots } = {}) {
  assertPlainObject(sequence, 'cinematic sequence');
  assertExactKeys(sequence, [
    'schemaVersion', 'sequenceRef', 'sequencePurposeRef', 'sourceTimelineRef',
    'orderedShotRefs', 'orderedShotSha256s', 'orderedSourceProjectionRefs',
    'orderedSourceProjectionSha256s', 'orderedSourceBranchRefs', 'branchTransitions',
    'continuityMode', 'presentationOrderOnly', 'editEffectPerformed',
    'canonicalBranchMergePerformed', 'canonicalHistoryMutation', 'sequenceSha256'
  ], 'cinematic sequence');
  if (sequence.schemaVersion !== MEDIA_CONTINUITY_SCHEMA.sequence) throw new TypeError('cinematic sequence schema mismatch');
  assertSafeRef(sequence.sequenceRef, 'sequence.sequenceRef');
  assertSafeRef(sequence.sequencePurposeRef, 'sequence.sequencePurposeRef');
  assertSafeRef(sequence.sourceTimelineRef, 'sequence.sourceTimelineRef');
  assertUniqueSafeRefs(sequence.orderedShotRefs, 'sequence.orderedShotRefs', { allowEmpty: false });
  if (!Array.isArray(sequence.orderedShotSha256s) || sequence.orderedShotSha256s.length !== sequence.orderedShotRefs.length) {
    throw new TypeError('cinematic sequence shot digest count mismatch');
  }
  sequence.orderedShotSha256s.forEach((hash, i) => assertSha256(hash, 'sequence.orderedShotSha256s[' + i + ']'));
  if (!Array.isArray(sequence.orderedSourceProjectionRefs) ||
      sequence.orderedSourceProjectionRefs.length !== sequence.orderedShotRefs.length) {
    throw new TypeError('cinematic sequence projection ref count mismatch');
  }
  sequence.orderedSourceProjectionRefs.forEach((ref, i) => assertSafeRef(ref, 'sequence.orderedSourceProjectionRefs[' + i + ']'));
  if (!Array.isArray(sequence.orderedSourceProjectionSha256s) ||
      sequence.orderedSourceProjectionSha256s.length !== sequence.orderedShotRefs.length) {
    throw new TypeError('cinematic sequence projection digest count mismatch');
  }
  sequence.orderedSourceProjectionSha256s.forEach((hash, i) => assertSha256(hash, 'sequence.orderedSourceProjectionSha256s[' + i + ']'));
  if (!Array.isArray(sequence.orderedSourceBranchRefs) || sequence.orderedSourceBranchRefs.length !== sequence.orderedShotRefs.length) {
    throw new TypeError('cinematic sequence branch ref count mismatch');
  }
  sequence.orderedSourceBranchRefs.forEach((ref, i) => assertSafeRef(ref, 'sequence.orderedSourceBranchRefs[' + i + ']'));
  if (!Array.isArray(sequence.branchTransitions) ||
      sequence.branchTransitions.length !== Math.max(0, sequence.orderedShotRefs.length - 1)) {
    throw new TypeError('cinematic sequence transition count mismatch');
  }
  for (let i = 0; i < sequence.branchTransitions.length; i += 1) {
    const t = sequence.branchTransitions[i];
    assertExactKeys(t, [
      'transitionRef', 'fromShotRef', 'toShotRef', 'fromBranchRef', 'toBranchRef',
      'transitionClass', 'canonicalBranchMergePerformed', 'canonicalHistoryMutation'
    ], 'cinematic transition');
    if (!['SAME_BRANCH_CUT', 'CROSS_BRANCH_EDIT'].includes(t.transitionClass)) throw new TypeError('cinematic transition class is unsupported');
    if (t.fromShotRef !== sequence.orderedShotRefs[i] || t.toShotRef !== sequence.orderedShotRefs[i + 1] ||
        t.fromBranchRef !== sequence.orderedSourceBranchRefs[i] || t.toBranchRef !== sequence.orderedSourceBranchRefs[i + 1]) {
      throw new TypeError('cinematic transition does not bind adjacent shot/branch coordinates');
    }
    const expectedClass = t.fromBranchRef === t.toBranchRef ? 'SAME_BRANCH_CUT' : 'CROSS_BRANCH_EDIT';
    if (t.transitionClass !== expectedClass) throw new TypeError('cinematic transition branch class mismatch');
    if (t.canonicalBranchMergePerformed !== false || t.canonicalHistoryMutation !== false) {
      throw new TypeError('cinematic transition must not merge Worldlines or mutate history');
    }
  }
  if (
    sequence.continuityMode !== 'EXPLICIT_BRANCH_AWARE_EDIT' || sequence.presentationOrderOnly !== true ||
    sequence.editEffectPerformed !== false || sequence.canonicalBranchMergePerformed !== false ||
    sequence.canonicalHistoryMutation !== false
  ) throw new TypeError('cinematic sequence must remain presentation-only and effect-free');
  const expectedRef = 'cinematic.sequence.' + hashCanonical({
    sequencePurposeRef: sequence.sequencePurposeRef,
    timelineRef: sequence.sourceTimelineRef,
    orderedShotSha256s: sequence.orderedShotSha256s
  }).slice(0, 32);
  if (sequence.sequenceRef !== expectedRef) throw new TypeError('cinematic sequence coordinate ref mismatch');
  rejectHiddenReasoning(sequence, 'cinematic sequence');
  const { sequenceSha256, ...body } = sequence;
  if (hashCanonical(body) !== sequenceSha256) throw new TypeError('cinematic sequence digest mismatch');
  if (!Array.isArray(shots) || shots.length === 0) {
    throw new TypeError('cinematic sequence verification requires exact shots context');
  }
  const expected = formCinematicSequence({ shots, sequencePurposeRef: sequence.sequencePurposeRef });
  if (!same(expected, sequence)) throw new TypeError('cinematic sequence shot/provenance context mismatch');
  return sequence;
}

export function formCinematicRenderRequest(input) {
  assertExactKeys(input, ['sequence', 'shots', 'presentationAdapterRef', 'outputProfileRef'], 'cinematic render request input');
  verifyCinematicSequence(input.sequence, { shots: input.shots });
  assertSafeRef(input.presentationAdapterRef, 'render request.presentationAdapterRef');
  assertSafeRef(input.outputProfileRef, 'render request.outputProfileRef');
  const body = {
    schemaVersion: MEDIA_CONTINUITY_SCHEMA.renderRequest,
    renderRequestRef: 'cinematic.render-request.' + hashCanonical({
      sequenceSha256: input.sequence.sequenceSha256,
      presentationAdapterRef: input.presentationAdapterRef,
      outputProfileRef: input.outputProfileRef
    }).slice(0, 32),
    sourceSequenceRef: input.sequence.sequenceRef,
    sourceSequenceSha256: input.sequence.sequenceSha256,
    presentationAdapterRef: input.presentationAdapterRef,
    outputProfileRef: input.outputProfileRef,
    renderRequestOnly: true,
    renderEffectPerformed: false,
    worldSimulationPerformed: false,
    modelReinference: false,
    canonicalHistoryMutation: false,
    runtimeMediaFileWritePerformed: false
  };
  return frozenCanonical({ ...body, renderRequestSha256: hashCanonical(body) });
}

export function verifyCinematicRenderRequest(request, { sequence, shots } = {}) {
  assertPlainObject(request, 'cinematic render request');
  assertExactKeys(request, [
    'schemaVersion', 'renderRequestRef', 'sourceSequenceRef', 'sourceSequenceSha256',
    'presentationAdapterRef', 'outputProfileRef', 'renderRequestOnly', 'renderEffectPerformed',
    'worldSimulationPerformed', 'modelReinference', 'canonicalHistoryMutation',
    'runtimeMediaFileWritePerformed', 'renderRequestSha256'
  ], 'cinematic render request');
  if (request.schemaVersion !== MEDIA_CONTINUITY_SCHEMA.renderRequest) throw new TypeError('cinematic render request schema mismatch');
  for (const [label, value] of [
    ['renderRequestRef', request.renderRequestRef], ['sourceSequenceRef', request.sourceSequenceRef],
    ['presentationAdapterRef', request.presentationAdapterRef], ['outputProfileRef', request.outputProfileRef]
  ]) assertSafeRef(value, 'render request.' + label);
  assertSha256(request.sourceSequenceSha256, 'render request.sourceSequenceSha256');
  assertSha256(request.renderRequestSha256, 'render request.renderRequestSha256');
  if (
    request.renderRequestOnly !== true || request.renderEffectPerformed !== false ||
    request.worldSimulationPerformed !== false || request.modelReinference !== false ||
    request.canonicalHistoryMutation !== false || request.runtimeMediaFileWritePerformed !== false
  ) throw new TypeError('cinematic render request must remain request-only and effect-free');
  const expectedRef = 'cinematic.render-request.' + hashCanonical({
    sequenceSha256: request.sourceSequenceSha256,
    presentationAdapterRef: request.presentationAdapterRef,
    outputProfileRef: request.outputProfileRef
  }).slice(0, 32);
  if (request.renderRequestRef !== expectedRef) throw new TypeError('cinematic render request coordinate ref mismatch');
  rejectHiddenReasoning(request, 'cinematic render request');
  const { renderRequestSha256, ...body } = request;
  if (hashCanonical(body) !== renderRequestSha256) throw new TypeError('cinematic render request digest mismatch');
  if (sequence === undefined || shots === undefined) {
    throw new TypeError('cinematic render request verification requires exact sequence + shots context');
  }
  verifyCinematicSequence(sequence, { shots });
  if (request.sourceSequenceRef !== sequence.sequenceRef || request.sourceSequenceSha256 !== sequence.sequenceSha256) {
    throw new TypeError('cinematic render request source sequence mismatch');
  }
  return request;
}

export function formSyntheticPresentationFrameEvidence(input) {
  assertExactKeys(input, ['shot', 'sourceTick', 'presentationAdapterRef', 'frameContentSha256'], 'synthetic presentation frame input');
  verifyCinematicShot(input.shot);
  assertNonNegativeInteger(input.sourceTick, 'frame.sourceTick');
  if (input.sourceTick < input.shot.fromTick || input.sourceTick > input.shot.toTick) {
    throw new TypeError('presentation frame sourceTick is outside shot interval');
  }
  assertSafeRef(input.presentationAdapterRef, 'frame.presentationAdapterRef');
  assertSha256(input.frameContentSha256, 'frame.frameContentSha256');
  const coordinate = {
    shotSha256: input.shot.shotSha256,
    sourceTick: input.sourceTick,
    presentationAdapterRef: input.presentationAdapterRef,
    frameContentSha256: input.frameContentSha256
  };
  const body = {
    schemaVersion: MEDIA_CONTINUITY_SCHEMA.frameEvidence,
    evidenceClass: 'SYNTHETIC_VEX_STUDIO_PRESENTATION_FIXTURE',
    frameRef: 'presentation.frame.' + hashCanonical(coordinate).slice(0, 32),
    shotRef: input.shot.shotRef,
    shotSha256: input.shot.shotSha256,
    sourceProjectionRef: input.shot.sourceProjectionRef,
    sourceProjectionSha256: input.shot.sourceProjectionSha256,
    sourceTimelineRef: input.shot.sourceTimelineRef,
    sourceBranchRef: input.shot.sourceBranchRef,
    sourceEventHeadSha256: input.shot.sourceEventHeadSha256,
    sourceTick: input.sourceTick,
    presentationAdapterRef: input.presentationAdapterRef,
    frameContentSha256: input.frameContentSha256,
    canonicalStateAuthority: false,
    chronicleEventAuthority: false,
    liveCaptureClaim: false,
    deviceCapturePerformed: false
  };
  return frozenCanonical({ ...body, frameEvidenceSha256: hashCanonical(body) });
}

export function verifyPresentationFrameEvidence(frame, { shot = null } = {}) {
  assertPlainObject(frame, 'presentation frame evidence');
  assertExactKeys(frame, [
    'schemaVersion', 'evidenceClass', 'frameRef', 'shotRef', 'shotSha256',
    'sourceProjectionRef', 'sourceProjectionSha256', 'sourceTimelineRef', 'sourceBranchRef',
    'sourceEventHeadSha256', 'sourceTick', 'presentationAdapterRef', 'frameContentSha256',
    'canonicalStateAuthority', 'chronicleEventAuthority', 'liveCaptureClaim',
    'deviceCapturePerformed', 'frameEvidenceSha256'
  ], 'presentation frame evidence');
  if (frame.schemaVersion !== MEDIA_CONTINUITY_SCHEMA.frameEvidence) throw new TypeError('presentation frame evidence schema mismatch');
  if (frame.evidenceClass !== 'SYNTHETIC_VEX_STUDIO_PRESENTATION_FIXTURE') {
    throw new TypeError('07F accepts only synthetic Vex Studio presentation fixture evidence');
  }
  for (const [label, value] of [
    ['frameRef', frame.frameRef], ['shotRef', frame.shotRef], ['sourceProjectionRef', frame.sourceProjectionRef],
    ['sourceTimelineRef', frame.sourceTimelineRef], ['sourceBranchRef', frame.sourceBranchRef],
    ['presentationAdapterRef', frame.presentationAdapterRef]
  ]) assertSafeRef(value, 'frame.' + label);
  for (const [label, value] of [
    ['shotSha256', frame.shotSha256], ['sourceProjectionSha256', frame.sourceProjectionSha256],
    ['sourceEventHeadSha256', frame.sourceEventHeadSha256], ['frameContentSha256', frame.frameContentSha256],
    ['frameEvidenceSha256', frame.frameEvidenceSha256]
  ]) assertSha256(value, 'frame.' + label);
  assertNonNegativeInteger(frame.sourceTick, 'frame.sourceTick');
  if (
    frame.canonicalStateAuthority !== false || frame.chronicleEventAuthority !== false ||
    frame.liveCaptureClaim !== false || frame.deviceCapturePerformed !== false
  ) throw new TypeError('presentation frame evidence must remain synthetic and noncanonical');
  const expectedRef = 'presentation.frame.' + hashCanonical({
    shotSha256: frame.shotSha256,
    sourceTick: frame.sourceTick,
    presentationAdapterRef: frame.presentationAdapterRef,
    frameContentSha256: frame.frameContentSha256
  }).slice(0, 32);
  if (frame.frameRef !== expectedRef) throw new TypeError('presentation frame coordinate ref mismatch');
  rejectHiddenReasoning(frame, 'presentation frame evidence');
  const { frameEvidenceSha256, ...body } = frame;
  if (hashCanonical(body) !== frameEvidenceSha256) throw new TypeError('presentation frame evidence digest mismatch');
  if (shot !== null) {
    verifyCinematicShot(shot);
    if (
      frame.shotRef !== shot.shotRef || frame.shotSha256 !== shot.shotSha256 ||
      frame.sourceProjectionRef !== shot.sourceProjectionRef ||
      frame.sourceProjectionSha256 !== shot.sourceProjectionSha256 ||
      frame.sourceTimelineRef !== shot.sourceTimelineRef || frame.sourceBranchRef !== shot.sourceBranchRef ||
      frame.sourceEventHeadSha256 !== shot.sourceEventHeadSha256 ||
      frame.sourceTick < shot.fromTick || frame.sourceTick > shot.toTick
    ) throw new TypeError('presentation frame shot/source context mismatch');
  }
  return frame;
}

export function formMediaCaptureManifest(input) {
  assertExactKeys(input, ['sequence', 'shots', 'frameEvidence', 'mediaProfileRef', 'containerClass'], 'media capture manifest input');
  verifyCinematicSequence(input.sequence, { shots: input.shots });
  if (!Array.isArray(input.frameEvidence) || input.frameEvidence.length === 0) {
    throw new TypeError('media capture manifest requires synthetic frame evidence');
  }
  const shotByRef = new Map(input.shots.map((shot) => [shot.shotRef, shot]));
  input.frameEvidence.forEach((frame) => {
    const shot = shotByRef.get(frame.shotRef);
    if (!shot) throw new TypeError('capture manifest frame shotRef is absent from exact shots context');
    verifyPresentationFrameEvidence(frame, { shot });
  });
  assertSafeRef(input.mediaProfileRef, 'capture manifest.mediaProfileRef');
  if (!CONTAINER.has(input.containerClass)) throw new TypeError('capture manifest containerClass is unsupported');
  const shotSet = new Set(input.sequence.orderedShotRefs);
  if (!input.frameEvidence.every((frame) => shotSet.has(frame.shotRef))) {
    throw new TypeError('capture manifest frame is not part of source sequence');
  }
  const frameRefs = input.frameEvidence.map((frame) => frame.frameRef);
  if (new Set(frameRefs).size !== frameRefs.length) throw new TypeError('capture manifest frame refs must be unique');
  const body = {
    schemaVersion: MEDIA_CONTINUITY_SCHEMA.captureManifest,
    manifestRef: 'media.capture-manifest.' + hashCanonical({
      sequenceSha256: input.sequence.sequenceSha256,
      frameEvidenceSha256s: input.frameEvidence.map((frame) => frame.frameEvidenceSha256),
      mediaProfileRef: input.mediaProfileRef,
      containerClass: input.containerClass
    }).slice(0, 32),
    sourceSequenceRef: input.sequence.sequenceRef,
    sourceSequenceSha256: input.sequence.sequenceSha256,
    sourceShotRefs: [...input.sequence.orderedShotRefs],
    sourceShotSha256s: [...input.sequence.orderedShotSha256s],
    sourceProjectionRefs: [...input.sequence.orderedSourceProjectionRefs],
    sourceProjectionSha256s: [...input.sequence.orderedSourceProjectionSha256s],
    frameRefs,
    frameEvidenceSha256s: input.frameEvidence.map((frame) => frame.frameEvidenceSha256),
    mediaProfileRef: input.mediaProfileRef,
    containerClass: input.containerClass,
    mediaBytesProduced: false,
    runtimeMediaFileWritePerformed: false,
    networkDeliveryPerformed: false,
    publicationPerformed: false,
    canonicalHistoryMutation: false
  };
  return frozenCanonical({ ...body, manifestSha256: hashCanonical(body) });
}

export function verifyMediaCaptureManifest(manifest, { sequence, shots, frameEvidence } = {}) {
  assertPlainObject(manifest, 'media capture manifest');
  assertExactKeys(manifest, [
    'schemaVersion', 'manifestRef', 'sourceSequenceRef', 'sourceSequenceSha256',
    'sourceShotRefs', 'sourceShotSha256s', 'sourceProjectionRefs', 'sourceProjectionSha256s',
    'frameRefs', 'frameEvidenceSha256s', 'mediaProfileRef', 'containerClass',
    'mediaBytesProduced', 'runtimeMediaFileWritePerformed', 'networkDeliveryPerformed',
    'publicationPerformed', 'canonicalHistoryMutation', 'manifestSha256'
  ], 'media capture manifest');
  if (manifest.schemaVersion !== MEDIA_CONTINUITY_SCHEMA.captureManifest) throw new TypeError('media capture manifest schema mismatch');
  for (const [label, value] of [
    ['manifestRef', manifest.manifestRef], ['sourceSequenceRef', manifest.sourceSequenceRef],
    ['mediaProfileRef', manifest.mediaProfileRef]
  ]) assertSafeRef(value, 'manifest.' + label);
  assertSha256(manifest.sourceSequenceSha256, 'manifest.sourceSequenceSha256');
  assertSha256(manifest.manifestSha256, 'manifest.manifestSha256');
  assertUniqueSafeRefs(manifest.sourceShotRefs, 'manifest.sourceShotRefs', { allowEmpty: false });
  assertUniqueSafeRefs(manifest.frameRefs, 'manifest.frameRefs', { allowEmpty: false });
  for (const [values, count, label] of [
    [manifest.sourceShotSha256s, manifest.sourceShotRefs.length, 'sourceShotSha256s'],
    [manifest.sourceProjectionRefs, manifest.sourceShotRefs.length, 'sourceProjectionRefs'],
    [manifest.sourceProjectionSha256s, manifest.sourceShotRefs.length, 'sourceProjectionSha256s'],
    [manifest.frameEvidenceSha256s, manifest.frameRefs.length, 'frameEvidenceSha256s']
  ]) {
    if (!Array.isArray(values) || values.length !== count) throw new TypeError('manifest ' + label + ' count mismatch');
  }
  manifest.sourceShotSha256s.forEach((hash, i) => assertSha256(hash, 'manifest.sourceShotSha256s[' + i + ']'));
  manifest.sourceProjectionRefs.forEach((ref, i) => assertSafeRef(ref, 'manifest.sourceProjectionRefs[' + i + ']'));
  manifest.sourceProjectionSha256s.forEach((hash, i) => assertSha256(hash, 'manifest.sourceProjectionSha256s[' + i + ']'));
  manifest.frameEvidenceSha256s.forEach((hash, i) => assertSha256(hash, 'manifest.frameEvidenceSha256s[' + i + ']'));
  if (!CONTAINER.has(manifest.containerClass)) throw new TypeError('capture manifest containerClass is unsupported');
  if (
    manifest.mediaBytesProduced !== false || manifest.runtimeMediaFileWritePerformed !== false ||
    manifest.networkDeliveryPerformed !== false || manifest.publicationPerformed !== false ||
    manifest.canonicalHistoryMutation !== false
  ) throw new TypeError('media capture manifest must remain effect-free');
  const expectedRef = 'media.capture-manifest.' + hashCanonical({
    sequenceSha256: manifest.sourceSequenceSha256,
    frameEvidenceSha256s: manifest.frameEvidenceSha256s,
    mediaProfileRef: manifest.mediaProfileRef,
    containerClass: manifest.containerClass
  }).slice(0, 32);
  if (manifest.manifestRef !== expectedRef) throw new TypeError('media capture manifest coordinate ref mismatch');
  rejectHiddenReasoning(manifest, 'media capture manifest');
  const { manifestSha256, ...body } = manifest;
  if (hashCanonical(body) !== manifestSha256) throw new TypeError('media capture manifest digest mismatch');
  if (sequence === undefined || shots === undefined || frameEvidence === undefined) {
    throw new TypeError('capture manifest verification requires exact sequence + shots + frameEvidence context');
  }
  const expected = formMediaCaptureManifest({
    sequence,
    shots,
    frameEvidence,
    mediaProfileRef: manifest.mediaProfileRef,
    containerClass: manifest.containerClass
  });
  if (!same(expected, manifest)) throw new TypeError('media capture manifest exact provenance context mismatch');
  return manifest;
}

function projectionPairs(manifest) {
  const map = new Map();
  for (let i = 0; i < manifest.sourceProjectionRefs.length; i += 1) {
    const ref = manifest.sourceProjectionRefs[i];
    const sha = manifest.sourceProjectionSha256s[i];
    if (map.has(ref) && map.get(ref) !== sha) throw new TypeError('capture manifest repeats projectionRef with conflicting digest');
    map.set(ref, sha);
  }
  return [...map.entries()].map(([ref, sha]) => ({ ref, sha }));
}

function authorizationEvidence(manifest, requesterParticipantRef, audienceRefs, contexts) {
  const required = projectionPairs(manifest);
  if (!Array.isArray(contexts) || contexts.length !== required.length) {
    throw new TypeError('external media export requires one exact authorization context per source projection');
  }
  const used = new Set();
  return required.map((pair) => {
    const index = contexts.findIndex((context, candidateIndex) =>
      !used.has(candidateIndex) && context?.projection?.projectionRef === pair.ref &&
      context?.projection?.projectionSha256 === pair.sha
    );
    if (index < 0) throw new TypeError('external media export authorization context does not cover every source projection');
    used.add(index);
    const context = contexts[index];
    assertExactKeys(context, [
      'authorization', 'request', 'decision', 'projection', 'chronicle', 'snapshot', 'motionWindows'
    ], 'media export authorization context');
    verifyWorldMemoryAuthorization(context.authorization, {
      request: context.request,
      decision: context.decision,
      projection: context.projection,
      chronicle: context.chronicle,
      snapshot: context.snapshot,
      motionWindows: context.motionWindows
    });
    if (context.request.requesterParticipantRef !== requesterParticipantRef) {
      throw new TypeError('media export authorization requester mismatch');
    }
    if (
      context.authorization.authorizationClass !== 'AUTHORIZED' ||
      !context.authorization.effectiveCapabilityRefs.includes('capability.world-memory.redistribute')
    ) throw new TypeError('media export requires exact REDISTRIBUTE authorization');
    const effectiveAudience = new Set(context.authorization.effectiveAudienceRefs);
    if (!audienceRefs.every((ref) => effectiveAudience.has(ref))) {
      throw new TypeError('media export authorization does not cover requested audience');
    }
    return context.authorization;
  });
}

export function formMediaExportRequest(input) {
  assertExactKeys(input, [
    'manifest', 'sequence', 'shots', 'frameEvidence',
    'requesterParticipantRef', 'audienceRefs', 'exportPurposeRef', 'authorizationContexts'
  ], 'media export request input');
  verifyMediaCaptureManifest(input.manifest, {
    sequence: input.sequence,
    shots: input.shots,
    frameEvidence: input.frameEvidence
  });
  assertSafeRef(input.requesterParticipantRef, 'media export requesterParticipantRef');
  assertUniqueSafeRefs(input.audienceRefs, 'media export audienceRefs');
  assertSafeRef(input.exportPurposeRef, 'media export exportPurposeRef');
  const external = input.audienceRefs.length > 0;
  let authorizations = [];
  if (external) {
    authorizations = authorizationEvidence(
      input.manifest, input.requesterParticipantRef, input.audienceRefs, input.authorizationContexts
    );
  } else if (!Array.isArray(input.authorizationContexts) || input.authorizationContexts.length !== 0) {
    throw new TypeError('local-only media export request must not carry unused authorization contexts');
  }
  const body = {
    schemaVersion: MEDIA_CONTINUITY_SCHEMA.exportRequest,
    exportRequestRef: '',
    sourceManifestRef: input.manifest.manifestRef,
    sourceManifestSha256: input.manifest.manifestSha256,
    sourceProjectionRefs: projectionPairs(input.manifest).map((entry) => entry.ref),
    sourceProjectionSha256s: projectionPairs(input.manifest).map((entry) => entry.sha),
    requesterParticipantRef: input.requesterParticipantRef,
    audienceRefs: [...input.audienceRefs],
    exportPurposeRef: input.exportPurposeRef,
    distributionClass: external ? 'EXTERNAL_REQUEST' : 'LOCAL_ONLY',
    authorizationRefs: authorizations.map((authorization) => authorization.authorizationRef),
    authorizationSha256s: authorizations.map((authorization) => authorization.authorizationSha256),
    exportRequestOnly: true,
    exportEffectPerformed: false,
    networkDeliveryPerformed: false,
    publicationPerformed: false,
    mediaBytesProduced: false,
    canonicalHistoryMutation: false
  };
  body.exportRequestRef = 'media.export-request.' + hashCanonical({
    manifestSha256: body.sourceManifestSha256,
    requesterParticipantRef: body.requesterParticipantRef,
    audienceRefs: body.audienceRefs,
    exportPurposeRef: body.exportPurposeRef,
    authorizationSha256s: body.authorizationSha256s
  }).slice(0, 32);
  return frozenCanonical({ ...body, exportRequestSha256: hashCanonical(body) });
}

export function verifyMediaExportRequest(request, {
  manifest, sequence, shots, frameEvidence, authorizationContexts
} = {}) {
  assertPlainObject(request, 'media export request');
  assertExactKeys(request, [
    'schemaVersion', 'exportRequestRef', 'sourceManifestRef', 'sourceManifestSha256',
    'sourceProjectionRefs', 'sourceProjectionSha256s', 'requesterParticipantRef',
    'audienceRefs', 'exportPurposeRef', 'distributionClass', 'authorizationRefs',
    'authorizationSha256s', 'exportRequestOnly', 'exportEffectPerformed',
    'networkDeliveryPerformed', 'publicationPerformed', 'mediaBytesProduced',
    'canonicalHistoryMutation', 'exportRequestSha256'
  ], 'media export request');
  if (request.schemaVersion !== MEDIA_CONTINUITY_SCHEMA.exportRequest) throw new TypeError('media export request schema mismatch');
  for (const [label, value] of [
    ['exportRequestRef', request.exportRequestRef], ['sourceManifestRef', request.sourceManifestRef],
    ['requesterParticipantRef', request.requesterParticipantRef], ['exportPurposeRef', request.exportPurposeRef]
  ]) assertSafeRef(value, 'media export.' + label);
  assertSha256(request.sourceManifestSha256, 'media export.sourceManifestSha256');
  assertSha256(request.exportRequestSha256, 'media export.exportRequestSha256');
  assertUniqueSafeRefs(request.sourceProjectionRefs, 'media export.sourceProjectionRefs', { allowEmpty: false });
  if (!Array.isArray(request.sourceProjectionSha256s) ||
      request.sourceProjectionSha256s.length !== request.sourceProjectionRefs.length) {
    throw new TypeError('media export projection evidence count mismatch');
  }
  request.sourceProjectionSha256s.forEach((hash, i) => assertSha256(hash, 'media export.sourceProjectionSha256s[' + i + ']'));
  assertUniqueSafeRefs(request.audienceRefs, 'media export.audienceRefs');
  assertUniqueSafeRefs(request.authorizationRefs, 'media export.authorizationRefs');
  if (!Array.isArray(request.authorizationSha256s) || request.authorizationSha256s.length !== request.authorizationRefs.length) {
    throw new TypeError('media export authorization evidence count mismatch');
  }
  request.authorizationSha256s.forEach((hash, i) => assertSha256(hash, 'media export.authorizationSha256s[' + i + ']'));
  if (!['LOCAL_ONLY', 'EXTERNAL_REQUEST'].includes(request.distributionClass)) {
    throw new TypeError('media export distributionClass is unsupported');
  }
  if ((request.audienceRefs.length === 0) !== (request.distributionClass === 'LOCAL_ONLY')) {
    throw new TypeError('media export distribution class/audience mismatch');
  }
  if (request.distributionClass === 'LOCAL_ONLY' && request.authorizationRefs.length !== 0) {
    throw new TypeError('local-only media export request must not retain authorization evidence');
  }
  if (request.distributionClass === 'EXTERNAL_REQUEST' && request.authorizationRefs.length === 0) {
    throw new TypeError('external media export request requires REDISTRIBUTE authorization evidence');
  }
  if (
    request.exportRequestOnly !== true || request.exportEffectPerformed !== false ||
    request.networkDeliveryPerformed !== false || request.publicationPerformed !== false ||
    request.mediaBytesProduced !== false || request.canonicalHistoryMutation !== false
  ) throw new TypeError('media export request must remain request-only and effect-free');
  const expectedRef = 'media.export-request.' + hashCanonical({
    manifestSha256: request.sourceManifestSha256,
    requesterParticipantRef: request.requesterParticipantRef,
    audienceRefs: request.audienceRefs,
    exportPurposeRef: request.exportPurposeRef,
    authorizationSha256s: request.authorizationSha256s
  }).slice(0, 32);
  if (request.exportRequestRef !== expectedRef) throw new TypeError('media export request coordinate ref mismatch');
  rejectHiddenReasoning(request, 'media export request');
  const { exportRequestSha256, ...body } = request;
  if (hashCanonical(body) !== exportRequestSha256) throw new TypeError('media export request digest mismatch');

  if (
    manifest === undefined || sequence === undefined || shots === undefined ||
    frameEvidence === undefined || authorizationContexts === undefined
  ) {
    throw new TypeError('media export verification requires exact manifest + sequence + shots + frameEvidence + authorization context');
  }
  const expected = formMediaExportRequest({
    manifest,
    sequence,
    shots,
    frameEvidence,
    requesterParticipantRef: request.requesterParticipantRef,
    audienceRefs: request.audienceRefs,
    exportPurposeRef: request.exportPurposeRef,
    authorizationContexts
  });
  if (!same(expected, request)) throw new TypeError('media export request exact provenance/authorization context mismatch');
  return request;
}
