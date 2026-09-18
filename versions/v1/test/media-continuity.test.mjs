import test from 'node:test';
import assert from 'node:assert/strict';

import {
  appendChronicleEvent,
  bindExecutionKernel,
  createChronicle,
  forkWorldline,
  formDeterminismEpoch,
  sealWorldSnapshot
} from '../src/core/chronicle/chronicle.mjs';
import {
  appendMotionSample,
  createMotionTail,
  promoteMotionWindow
} from '../src/core/chronicle/motion-tail.mjs';
import {
  evaluateWorldMemoryAuthorization,
  formSyntheticExternalPolicyDecision,
  formWorldMemoryPermissionRequest,
  formWorldMemoryProjection
} from '../src/core/chronicle/world-memory.mjs';
import {
  formCinematicRenderRequest,
  formCinematicSequence,
  formCinematicShot,
  formMediaCaptureManifest,
  formMediaExportRequest,
  formSyntheticPresentationFrameEvidence,
  verifyCinematicRenderRequest,
  verifyCinematicSequence,
  verifyCinematicShot,
  verifyMediaCaptureManifest,
  verifyMediaExportRequest,
  verifyPresentationFrameEvidence
} from '../src/core/chronicle/media-continuity.mjs';
import { canonicalClone, hashCanonical } from '../src/core/chronicle/canonical.mjs';

const H = (character) => character.repeat(64);

function reducer(state, frame) {
  state.tick = frame.tick;
  return state;
}

function epoch() {
  const kernel = bindExecutionKernel({
    kernelRef: 'kernel.vexworld.media-continuity-proof.v1',
    reducerSource: Function.prototype.toString.call(reducer),
    bindings: {}
  });
  return formDeterminismEpoch({
    epochRef: 'epoch.vexworld.media-continuity-proof.v1',
    worldPackageFingerprint: H('a'),
    kernelRef: kernel.kernelRef,
    kernelSha256: kernel.kernelSha256,
    stateSchemaVersion: 'fixture.media-continuity-state/v1',
    fixedStepMs: 1000 / 60,
    numericProfileRef: 'numeric.media-continuity.fixture.v1',
    rootSeed: 707,
    rngStreamRefs: ['rng.media-continuity']
  });
}

function pose(x) {
  return {
    positionMeters: { x, y: 1.75, z: -x },
    orientationQuaternion: { x: 0, y: 0, z: 0, w: 1 },
    linearVelocityMetersPerSecondOrNull: null,
    angularVelocityRadiansPerSecondOrNull: null
  };
}

function fixture() {
  const determinismEpoch = epoch();
  let chronicle = createChronicle({
    timelineRef: 'timeline.first-grove.media.0001',
    branchRef: 'worldline.first-grove.verified.media',
    epoch: determinismEpoch
  });

  const observed = appendChronicleEvent(chronicle, {
    tick: 1,
    ordinal: 0,
    actorRef: 'system.vexworld.observation',
    eventClass: 'OBSERVATION_DELIVERED',
    privacyClass: 'PARTY_SHARED',
    causationRefs: [],
    correlationRefOrNull: 'correlation.media.0001',
    payload: { observationRef: 'observation.media.0001', deliveredToRef: 'participant.victor' }
  });
  chronicle = observed.chronicle;

  const intent = appendChronicleEvent(chronicle, {
    tick: 2,
    ordinal: 0,
    actorRef: 'participant.victor',
    eventClass: 'INTENT_ACCEPTED',
    privacyClass: 'PARTY_SHARED',
    causationRefs: [observed.event.eventRef, 'decision.media.0001'],
    correlationRefOrNull: 'correlation.media.0001',
    payload: { intentRef: 'intent.media.0001', decisionRef: 'decision.media.0001' }
  });
  chronicle = intent.chronicle;

  const promoted = appendChronicleEvent(chronicle, {
    tick: 3,
    ordinal: 0,
    actorRef: 'system.vexworld.chronicle',
    eventClass: 'MOTION_WINDOW_PROMOTED',
    privacyClass: 'PARTY_SHARED',
    causationRefs: [intent.event.eventRef],
    correlationRefOrNull: 'correlation.media.0001',
    payload: { windowRef: 'motion-window.media.0001' }
  });
  chronicle = promoted.chronicle;

  const snapshot = sealWorldSnapshot({
    chronicle,
    tick: 3,
    canonicalState: { schemaVersion: 'fixture.media-continuity-state/v1', tick: 3, marker: 'accepted' }
  });

  let tail = createMotionTail({
    tailRef: 'motion-tail.media.0001',
    participantRef: 'participant.victor',
    coordinateSpaceRef: 'space.first-grove.arena',
    maxSamples: 4,
    maxAgeTicks: 4,
    privacyClass: 'PARTICIPANT_PRIVATE',
    retentionClass: 'EPHEMERAL_HOT_TAIL'
  });
  tail = appendMotionSample(tail, {
    sequence: 1,
    tick: 2,
    sourceRef: 'source.synthetic.media',
    pose: pose(0.1),
    materialityRefs: ['materiality.media.intent']
  }).tail;
  tail = appendMotionSample(tail, {
    sequence: 2,
    tick: 3,
    sourceRef: 'source.synthetic.media',
    pose: pose(0.2),
    materialityRefs: ['materiality.media.motion']
  }).tail;

  const motionWindow = promoteMotionWindow(tail, {
    windowRef: 'motion-window.media.0001',
    fromTick: 2,
    toTick: 3,
    reasonRef: 'reason.media.material-window',
    consentRefOrNull: 'consent.media.party.0001',
    privacyClass: 'PARTY_SHARED',
    retentionClass: 'EVENT_EVIDENCE',
    eventRefs: [intent.event.eventRef, promoted.event.eventRef]
  });

  const projection = formWorldMemoryProjection({
    chronicle,
    snapshot,
    viewerParticipantRef: 'participant.victor',
    fromTick: 1,
    toTick: 3,
    includedEventRefs: [observed.event.eventRef, intent.event.eventRef, promoted.event.eventRef],
    includedDecisionRefs: ['decision.media.0001'],
    includedMotionWindows: [motionWindow],
    privacyClass: 'PARTY_SHARED'
  });

  const branch = forkWorldline({
    parentChronicle: chronicle,
    snapshot,
    branchRef: 'worldline.first-grove.media-reconstruction.0001',
    branchClass: 'MEDIA_RECONSTRUCTION',
    formedByRef: 'participant.victor',
    purposeRef: 'purpose.media.branch-reconstruction',
    assumptionRefs: []
  });
  const alternateEvent = appendChronicleEvent(branch.chronicle, {
    tick: 4,
    ordinal: 0,
    actorRef: 'participant.victor',
    eventClass: 'ACTION_STARTED',
    privacyClass: 'PARTY_SHARED',
    causationRefs: [intent.event.eventRef],
    correlationRefOrNull: 'correlation.media.alt.0001',
    payload: { actionRef: 'action.media.alt.0001' }
  });
  const alternateChronicle = alternateEvent.chronicle;
  const alternateSnapshot = sealWorldSnapshot({
    chronicle: alternateChronicle,
    tick: 4,
    canonicalState: { schemaVersion: 'fixture.media-continuity-state/v1', tick: 4, marker: 'alternate' }
  });
  const alternateProjection = formWorldMemoryProjection({
    chronicle: alternateChronicle,
    snapshot: alternateSnapshot,
    viewerParticipantRef: 'participant.victor',
    fromTick: 4,
    toTick: 4,
    includedEventRefs: [alternateEvent.event.eventRef],
    includedDecisionRefs: [],
    includedMotionWindows: [],
    privacyClass: 'PARTY_SHARED'
  });

  return {
    chronicle, snapshot, motionWindow, projection,
    observed: observed.event, intent: intent.event, promoted: promoted.event,
    alternateChronicle, alternateSnapshot, alternateProjection, alternateEvent: alternateEvent.event
  };
}

function shot(f, overrides = {}) {
  return formCinematicShot({
    projection: f.projection,
    chronicle: f.chronicle,
    snapshot: f.snapshot,
    motionWindows: [f.motionWindow],
    fromTick: 1,
    toTick: 3,
    includedEventRefs: [f.observed.eventRef, f.intent.eventRef, f.promoted.eventRef],
    includedMotionWindowRefs: [f.motionWindow.windowRef],
    cameraIntent: {
      cameraRef: 'camera.media.director.0001',
      framingClass: 'TRACKING',
      subjectRefs: ['participant.victor'],
      anchorRefOrNull: null,
      presentationTransformRef: 'presentation-transform.media.default'
    },
    privacyClass: 'PARTY_SHARED',
    presentationClass: 'CINEMATIC_REPLAY',
    ...overrides
  });
}

function alternateShot(f) {
  return formCinematicShot({
    projection: f.alternateProjection,
    chronicle: f.alternateChronicle,
    snapshot: f.alternateSnapshot,
    motionWindows: [],
    fromTick: 4,
    toTick: 4,
    includedEventRefs: [f.alternateEvent.eventRef],
    includedMotionWindowRefs: [],
    cameraIntent: {
      cameraRef: 'camera.media.director.0002',
      framingClass: 'CLOSE',
      subjectRefs: ['participant.victor'],
      anchorRefOrNull: null,
      presentationTransformRef: 'presentation-transform.media.alternate'
    },
    privacyClass: 'PARTY_SHARED',
    presentationClass: 'CINEMATIC_BRANCH_EDIT'
  });
}

function rehash(value, digestField) {
  const body = canonicalClone(value);
  delete body[digestField];
  value[digestField] = hashCanonical(body);
}

function redistributeAuthorization(f, capability = 'capability.world-memory.redistribute') {
  const request = formWorldMemoryPermissionRequest({
    projection: f.projection,
    chronicle: f.chronicle,
    snapshot: f.snapshot,
    motionWindows: [f.motionWindow],
    requesterParticipantRef: 'participant.victor',
    subjectParticipantRefs: ['participant.victor', 'participant.mira'],
    requestedCapabilityRefs: [capability],
    purposeRef: 'purpose.media.export',
    requestedAudienceRefs: ['participant.mira'],
    requestedRetentionClass: 'TRANSIENT_REPLAY',
    externalPolicyOwnerRef: 'policy.vexlife.relationships-consent'
  });
  const decision = formSyntheticExternalPolicyDecision({
    request,
    projection: f.projection,
    chronicle: f.chronicle,
    snapshot: f.snapshot,
    motionWindows: [f.motionWindow],
    policyDecisionRef: 'policy-decision.media.' + (capability.endsWith('redistribute') ? 'redistribute' : 'view') + '.0001',
    decisionClass: 'ALLOW',
    grantedCapabilityRefs: [capability],
    audienceRefs: ['participant.mira'],
    currentnessRef: 'currentness.media.0001',
    consentRefOrNull: 'consent.media.0001'
  });
  const authorization = evaluateWorldMemoryAuthorization({
    request,
    decision,
    projection: f.projection,
    chronicle: f.chronicle,
    snapshot: f.snapshot,
    motionWindows: [f.motionWindow]
  });
  return {
    authorization, request, decision,
    projection: f.projection,
    chronicle: f.chronicle,
    snapshot: f.snapshot,
    motionWindows: [f.motionWindow]
  };
}

test('cinematic shot is exact-source-grounded, privacy bounded and presentation-only', () => {
  const f = fixture();
  const formed = shot(f);
  assert.equal(verifyCinematicShot(formed, {
    projection: f.projection,
    chronicle: f.chronicle,
    snapshot: f.snapshot,
    motionWindows: [f.motionWindow]
  }), formed);
  assert.equal(formed.canonicalHistoryMutation, false);
  assert.equal(formed.worldStateMutation, false);
  assert.equal(formed.participantExistenceInference, false);
  assert.equal(formed.modelReinference, false);

  assert.throws(() => shot(f, { privacyClass: 'PUBLIC_WORLD' }), /cannot widen source privacy/);
  assert.throws(() => shot(f, {
    includedEventRefs: [f.intent.eventRef, f.observed.eventRef, f.promoted.eventRef]
  }), /ordered subset/);
  assert.throws(() => shot(f, {
    cameraIntent: {
      cameraRef: 'camera.media.bad',
      framingClass: 'CLOSE',
      subjectRefs: ['participant.mallory'],
      anchorRefOrNull: null,
      presentationTransformRef: 'presentation-transform.media.default'
    }
  }), /subjectRef is not present/);

  const branchLie = canonicalClone(formed);
  branchLie.sourceBranchRef = 'worldline.first-grove.forged';
  branchLie.shotRef = 'cinematic.shot.' + hashCanonical({
    projectionSha256: branchLie.sourceProjectionSha256,
    sourceTimelineRef: branchLie.sourceTimelineRef,
    sourceBranchRef: branchLie.sourceBranchRef,
    sourceEventHeadSha256: branchLie.sourceEventHeadSha256,
    sourceSnapshotSha256: branchLie.sourceSnapshotSha256,
    fromTick: branchLie.fromTick,
    toTick: branchLie.toTick,
    includedEventRefs: branchLie.includedEventRefs,
    includedMotionWindowRefs: branchLie.includedMotionWindowRefs,
    cameraIntent: branchLie.cameraIntent,
    privacyClass: branchLie.privacyClass,
    presentationClass: branchLie.presentationClass
  }).slice(0, 32);
  rehash(branchLie, 'shotSha256');
  assert.throws(() => verifyCinematicShot(branchLie, {
    projection: f.projection,
    chronicle: f.chronicle,
    snapshot: f.snapshot,
    motionWindows: [f.motionWindow]
  }), /source context mismatch/);
});

test('cinematic sequence preserves branch identities and never merges Worldlines', () => {
  const f = fixture();
  const first = shot(f, {
    fromTick: 1,
    toTick: 2,
    includedEventRefs: [f.observed.eventRef, f.intent.eventRef],
    includedMotionWindowRefs: []
  });
  const second = shot(f, {
    fromTick: 2,
    toTick: 3,
    includedEventRefs: [f.intent.eventRef, f.promoted.eventRef],
    includedMotionWindowRefs: [f.motionWindow.windowRef],
    cameraIntent: {
      cameraRef: 'camera.media.director.0003',
      framingClass: 'WIDE',
      subjectRefs: ['participant.victor'],
      anchorRefOrNull: null,
      presentationTransformRef: 'presentation-transform.media.second'
    }
  });
  const sameBranch = formCinematicSequence({
    shots: [first, second],
    sequencePurposeRef: 'purpose.media.same-branch'
  });
  assert.equal(verifyCinematicSequence(sameBranch, { shots: [first, second] }), sameBranch);
  assert.equal(sameBranch.branchTransitions[0].transitionClass, 'SAME_BRANCH_CUT');

  const alternate = alternateShot(f);
  const crossBranch = formCinematicSequence({
    shots: [second, alternate],
    sequencePurposeRef: 'purpose.media.cross-branch'
  });
  assert.equal(crossBranch.branchTransitions[0].transitionClass, 'CROSS_BRANCH_EDIT');
  assert.equal(crossBranch.canonicalBranchMergePerformed, false);
  assert.equal(crossBranch.canonicalHistoryMutation, false);

  const mergeLie = canonicalClone(crossBranch);
  mergeLie.branchTransitions[0].canonicalBranchMergePerformed = true;
  rehash(mergeLie, 'sequenceSha256');
  assert.throws(() => verifyCinematicSequence(mergeLie), /must not merge Worldlines/);
});

test('re-render and synthetic frame evidence remain noncanonical and effect-free', () => {
  const f = fixture();
  const formedShot = shot(f);
  const sequence = formCinematicSequence({
    shots: [formedShot],
    sequencePurposeRef: 'purpose.media.render'
  });
  const render = formCinematicRenderRequest({
    sequence,
    presentationAdapterRef: 'adapter.synthetic.vex-studio',
    outputProfileRef: 'output-profile.media.preview'
  });
  assert.equal(verifyCinematicRenderRequest(render, { sequence }), render);
  assert.equal(render.worldSimulationPerformed, false);
  assert.equal(render.modelReinference, false);
  assert.equal(render.runtimeMediaFileWritePerformed, false);

  const renderLie = canonicalClone(render);
  renderLie.modelReinference = true;
  rehash(renderLie, 'renderRequestSha256');
  assert.throws(() => verifyCinematicRenderRequest(renderLie), /request-only and effect-free/);

  const frame = formSyntheticPresentationFrameEvidence({
    shot: formedShot,
    sourceTick: 2,
    presentationAdapterRef: 'adapter.synthetic.vex-studio',
    frameContentSha256: H('b')
  });
  assert.equal(verifyPresentationFrameEvidence(frame, { shot: formedShot }), frame);
  assert.equal(frame.canonicalStateAuthority, false);
  assert.equal(frame.chronicleEventAuthority, false);
  assert.equal(frame.liveCaptureClaim, false);

  const liveLie = canonicalClone(frame);
  liveLie.evidenceClass = 'LIVE_VEX_STUDIO_CAPTURE';
  rehash(liveLie, 'frameEvidenceSha256');
  assert.throws(() => verifyPresentationFrameEvidence(liveLie), /only synthetic Vex Studio/);

  const digestAsHistory = canonicalClone(frame);
  digestAsHistory.sourceEventHeadSha256 = digestAsHistory.frameContentSha256;
  rehash(digestAsHistory, 'frameEvidenceSha256');
  assert.throws(() => verifyPresentationFrameEvidence(digestAsHistory, { shot: formedShot }), /shot\/source context mismatch/);
});

test('capture and export descriptors produce no media/network/publication effects and require REDISTRIBUTE', () => {
  const f = fixture();
  const formedShot = shot(f);
  const sequence = formCinematicSequence({
    shots: [formedShot],
    sequencePurposeRef: 'purpose.media.capture'
  });
  const frame = formSyntheticPresentationFrameEvidence({
    shot: formedShot,
    sourceTick: 3,
    presentationAdapterRef: 'adapter.synthetic.vex-studio',
    frameContentSha256: H('c')
  });
  const manifest = formMediaCaptureManifest({
    sequence,
    frameEvidence: [frame],
    mediaProfileRef: 'media-profile.synthetic.preview',
    containerClass: 'VIDEO_STREAM_DESCRIPTOR'
  });
  assert.equal(verifyMediaCaptureManifest(manifest, { sequence, frameEvidence: [frame] }), manifest);
  assert.equal(manifest.mediaBytesProduced, false);
  assert.equal(manifest.runtimeMediaFileWritePerformed, false);
  assert.equal(manifest.networkDeliveryPerformed, false);
  assert.equal(manifest.publicationPerformed, false);

  const bytesLie = canonicalClone(manifest);
  bytesLie.mediaBytesProduced = true;
  rehash(bytesLie, 'manifestSha256');
  assert.throws(() => verifyMediaCaptureManifest(bytesLie), /must remain effect-free/);

  const localOnly = formMediaExportRequest({
    manifest,
    requesterParticipantRef: 'participant.victor',
    audienceRefs: [],
    exportPurposeRef: 'purpose.media.local-preview',
    authorizationContexts: []
  });
  assert.equal(verifyMediaExportRequest(localOnly, { manifest, authorizationContexts: [] }), localOnly);
  assert.equal(localOnly.exportEffectPerformed, false);
  assert.equal(localOnly.publicationPerformed, false);

  assert.throws(() => formMediaExportRequest({
    manifest,
    requesterParticipantRef: 'participant.victor',
    audienceRefs: ['participant.mira'],
    exportPurposeRef: 'purpose.media.share',
    authorizationContexts: []
  }), /one exact authorization context per source projection/);

  const redistribute = redistributeAuthorization(f);
  const external = formMediaExportRequest({
    manifest,
    requesterParticipantRef: 'participant.victor',
    audienceRefs: ['participant.mira'],
    exportPurposeRef: 'purpose.media.share',
    authorizationContexts: [redistribute]
  });
  assert.equal(verifyMediaExportRequest(external, {
    manifest,
    authorizationContexts: [redistribute]
  }), external);
  assert.equal(external.distributionClass, 'EXTERNAL_REQUEST');
  assert.equal(external.networkDeliveryPerformed, false);
  assert.equal(external.publicationPerformed, false);

  const viewOnly = redistributeAuthorization(f, 'capability.world-memory.view');
  assert.throws(() => formMediaExportRequest({
    manifest,
    requesterParticipantRef: 'participant.victor',
    audienceRefs: ['participant.mira'],
    exportPurposeRef: 'purpose.media.share',
    authorizationContexts: [viewOnly]
  }), /requires exact REDISTRIBUTE authorization/);

  const escalated = canonicalClone(viewOnly.authorization);
  escalated.effectiveCapabilityRefs.push('capability.world-memory.redistribute');
  rehash(escalated, 'authorizationSha256');
  assert.throws(() => formMediaExportRequest({
    manifest,
    requesterParticipantRef: 'participant.victor',
    audienceRefs: ['participant.mira'],
    exportPurposeRef: 'purpose.media.share',
    authorizationContexts: [{ ...viewOnly, authorization: escalated }]
  }), /context mismatch/);
});
