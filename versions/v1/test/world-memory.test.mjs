import test from 'node:test';
import assert from 'node:assert/strict';

import {
  appendChronicleEvent,
  bindExecutionKernel,
  createChronicle,
  formDeterminismEpoch,
  sealWorldSnapshot,
  verifyChronicle
} from '../src/core/chronicle/chronicle.mjs';
import {
  appendMotionSample,
  createMotionTail,
  promoteMotionWindow,
  verifyMotionWindow
} from '../src/core/chronicle/motion-tail.mjs';
import {
  WORLD_MEMORY_CAPABILITIES,
  evaluateWorldMemoryAuthorization,
  formPrivateRehearsalForkRequest,
  formSavedMomentDescriptor,
  formSyntheticExternalPolicyDecision,
  formWorldMemoryPermissionRequest,
  formWorldMemoryProjection,
  verifyExternalPolicyDecision,
  verifyPrivateRehearsalForkRequest,
  verifySavedMomentDescriptor,
  verifyWorldMemoryAuthorization,
  verifyWorldMemoryProjection
} from '../src/core/chronicle/world-memory.mjs';
import { canonicalClone, hashCanonical } from '../src/core/chronicle/canonical.mjs';

const H = (character) => character.repeat(64);

function reducer(state, frame) {
  state.tick = frame.tick;
  return state;
}

function epoch() {
  const kernel = bindExecutionKernel({
    kernelRef: 'kernel.vexworld.world-memory-proof.v1',
    reducerSource: Function.prototype.toString.call(reducer),
    bindings: {}
  });
  return formDeterminismEpoch({
    epochRef: 'epoch.vexworld.world-memory-proof.v1',
    worldPackageFingerprint: H('a'),
    kernelRef: kernel.kernelRef,
    kernelSha256: kernel.kernelSha256,
    stateSchemaVersion: 'fixture.world-memory-state/v1',
    fixedStepMs: 1000 / 60,
    numericProfileRef: 'numeric.world-memory.fixture.v1',
    rootSeed: 101,
    rngStreamRefs: ['rng.world-memory']
  });
}

function pose(x) {
  return {
    positionMeters: { x, y: 1.75, z: -x },
    orientationQuaternion: { x: 0, y: 0, z: 0, w: 1 },
    linearVelocityMetersPerSecondOrNull: { x: 0.25, y: 0, z: 0 },
    angularVelocityRadiansPerSecondOrNull: null
  };
}

function fixture() {
  const determinismEpoch = epoch();
  let chronicle = createChronicle({
    timelineRef: 'timeline.first-grove.world-memory.0001',
    branchRef: 'worldline.first-grove.verified.world-memory',
    epoch: determinismEpoch
  });

  const observed = appendChronicleEvent(chronicle, {
    tick: 1,
    ordinal: 0,
    actorRef: 'system.vexworld.observation',
    eventClass: 'OBSERVATION_DELIVERED',
    privacyClass: 'PARTY_SHARED',
    causationRefs: [],
    correlationRefOrNull: 'correlation.world-memory.0001',
    payload: {
      observationRef: 'observation.world-memory.0001',
      deliveredToRef: 'participant.victor'
    }
  });
  chronicle = observed.chronicle;

  const decisionRef = 'decision.world-memory.0001';
  const intent = appendChronicleEvent(chronicle, {
    tick: 2,
    ordinal: 0,
    actorRef: 'participant.victor',
    eventClass: 'INTENT_ACCEPTED',
    privacyClass: 'PARTY_SHARED',
    causationRefs: [observed.event.eventRef, decisionRef],
    correlationRefOrNull: 'correlation.world-memory.0001',
    payload: {
      intentRef: 'intent.world-memory.0001',
      decisionRef
    }
  });
  chronicle = intent.chronicle;

  const promoted = appendChronicleEvent(chronicle, {
    tick: 3,
    ordinal: 0,
    actorRef: 'system.vexworld.chronicle',
    eventClass: 'MOTION_WINDOW_PROMOTED',
    privacyClass: 'PARTY_SHARED',
    causationRefs: [intent.event.eventRef],
    correlationRefOrNull: 'correlation.world-memory.0001',
    payload: { windowRef: 'motion-window.world-memory.0001' }
  });
  chronicle = promoted.chronicle;

  const privateEvent = appendChronicleEvent(chronicle, {
    tick: 3,
    ordinal: 1,
    actorRef: 'participant.victor',
    eventClass: 'ACTION_STARTED',
    privacyClass: 'PARTICIPANT_PRIVATE',
    causationRefs: [intent.event.eventRef],
    correlationRefOrNull: 'correlation.world-memory.private.0001',
    payload: { actionRef: 'action.world-memory.private.0001' }
  });
  chronicle = privateEvent.chronicle;

  const otherPrivateEvent = appendChronicleEvent(chronicle, {
    tick: 3,
    ordinal: 2,
    actorRef: 'participant.mira',
    eventClass: 'ACTION_STARTED',
    privacyClass: 'PARTICIPANT_PRIVATE',
    causationRefs: [intent.event.eventRef],
    correlationRefOrNull: 'correlation.world-memory.private.mira.0001',
    payload: { actionRef: 'action.world-memory.private.mira.0001' }
  });
  chronicle = otherPrivateEvent.chronicle;
  verifyChronicle(chronicle);

  const snapshot = sealWorldSnapshot({
    chronicle,
    tick: 3,
    canonicalState: {
      schemaVersion: 'fixture.world-memory-state/v1',
      tick: 3,
      marker: 'accepted'
    }
  });

  let tail = createMotionTail({
    tailRef: 'motion-tail.world-memory.0001',
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
    sourceRef: 'source.synthetic.world-memory',
    pose: pose(0.1),
    materialityRefs: ['materiality.world-memory.intent']
  }).tail;
  tail = appendMotionSample(tail, {
    sequence: 2,
    tick: 3,
    sourceRef: 'source.synthetic.world-memory',
    pose: pose(0.2),
    materialityRefs: ['materiality.world-memory.motion']
  }).tail;

  const motionWindow = promoteMotionWindow(tail, {
    windowRef: 'motion-window.world-memory.0001',
    fromTick: 2,
    toTick: 3,
    reasonRef: 'reason.world-memory.material-window',
    consentRefOrNull: 'consent.world-memory.party.0001',
    privacyClass: 'PARTY_SHARED',
    retentionClass: 'EVENT_EVIDENCE',
    eventRefs: [intent.event.eventRef, promoted.event.eventRef]
  });
  verifyMotionWindow(motionWindow);

  const publicEventRefs = [
    observed.event.eventRef,
    intent.event.eventRef,
    promoted.event.eventRef
  ];

  const projection = formWorldMemoryProjection({
    chronicle,
    snapshot,
    viewerParticipantRef: 'participant.victor',
    fromTick: 1,
    toTick: 3,
    includedEventRefs: publicEventRefs,
    includedDecisionRefs: [decisionRef],
    includedMotionWindows: [motionWindow],
    privacyClass: 'PARTY_SHARED'
  });

  return {
    chronicle,
    snapshot,
    tail,
    motionWindow,
    projection,
    decisionRef,
    observed: observed.event,
    intent: intent.event,
    promoted: promoted.event,
    privateEvent: privateEvent.event,
    otherPrivateEvent: otherPrivateEvent.event
  };
}

function rehash(object, field) {
  const copy = canonicalClone(object);
  delete copy[field];
  object[field] = hashCanonical(copy);
  return object;
}

test('World Memory projection is bounded, read-only and source-grounded', () => {
  const f = fixture();

  assert.equal(verifyWorldMemoryProjection(f.projection, {
    chronicle: f.chronicle,
    snapshot: f.snapshot,
    motionWindows: [f.motionWindow]
  }), f.projection);

  assert.equal(f.projection.projectionMode, 'READ_ONLY_WORLD_MEMORY');
  assert.equal(f.projection.historyMutation, false);
  assert.equal(f.projection.modelReinference, false);
  assert.equal(f.projection.worldEffectPerformed, false);
  assert.equal(f.projection.retentionClass, 'TRANSIENT_REPLAY');

  const foreignEvent = canonicalClone(f.projection);
  foreignEvent.includedEventRefs[0] = 'worldline.foreign.event.000000000001.000000';
  foreignEvent.includedEventSha256s[0] = H('b');
  rehash(foreignEvent, 'projectionSha256');
  assert.throws(() => verifyWorldMemoryProjection(foreignEvent, {
    chronicle: f.chronicle,
    snapshot: f.snapshot,
    motionWindows: [f.motionWindow]
  }), /not present in source Chronicle|source evidence mismatch/);

  const foreignBranch = canonicalClone(f.projection);
  foreignBranch.sourceBranchRef = 'worldline.foreign';
  rehash(foreignBranch, 'projectionSha256');
  assert.throws(() => verifyWorldMemoryProjection(foreignBranch, {
    chronicle: f.chronicle,
    snapshot: f.snapshot,
    motionWindows: [f.motionWindow]
  }), /source evidence mismatch/);

  assert.throws(() => formWorldMemoryProjection({
    chronicle: f.chronicle,
    snapshot: f.snapshot,
    viewerParticipantRef: 'participant.victor',
    fromTick: 1,
    toTick: 3,
    includedEventRefs: [
      f.observed.eventRef,
      f.intent.eventRef,
      f.promoted.eventRef,
      f.privateEvent.eventRef
    ],
    includedDecisionRefs: [f.decisionRef],
    includedMotionWindows: [f.motionWindow],
    privacyClass: 'PARTY_SHARED'
  }), /cannot widen source privacy/);

  assert.throws(() => formWorldMemoryProjection({
    chronicle: f.chronicle,
    snapshot: f.snapshot,
    viewerParticipantRef: 'participant.victor',
    fromTick: 1,
    toTick: 3,
    includedEventRefs: [
      f.observed.eventRef,
      f.intent.eventRef,
      f.promoted.eventRef,
      f.otherPrivateEvent.eventRef
    ],
    includedDecisionRefs: [f.decisionRef],
    includedMotionWindows: [f.motionWindow],
    privacyClass: 'PARTICIPANT_PRIVATE'
  }), /another participant private Chronicle event/);

  assert.throws(() => formWorldMemoryProjection({
    chronicle: f.chronicle,
    snapshot: f.snapshot,
    viewerParticipantRef: 'participant.victor',
    fromTick: 1,
    toTick: 3,
    includedEventRefs: [f.observed.eventRef, f.intent.eventRef, f.promoted.eventRef],
    includedDecisionRefs: [f.decisionRef],
    includedMotionWindows: [f.tail],
    privacyClass: 'PARTY_SHARED'
  }), /motion window|fields do not match contract/i);
});

test('replay, private fork request and saved moment remain distinct effect-free objects', () => {
  const f = fixture();
  const projectionBefore = JSON.stringify(f.projection);

  const forkRequest = formPrivateRehearsalForkRequest({
    projection: f.projection,
    chronicle: f.chronicle,
    snapshot: f.snapshot,
    motionWindows: [f.motionWindow],
    requestedBranchRef: 'worldline.first-grove.private-rehearsal.world-memory.0001',
    formedByParticipantRef: 'participant.victor',
    purposeRef: 'purpose.world-memory.rehearsal',
    assumptionRefs: ['assumption.try-different-guard-timing']
  });
  verifyPrivateRehearsalForkRequest(forkRequest, {
    projection: f.projection,
    chronicle: f.chronicle,
    snapshot: f.snapshot,
    motionWindows: [f.motionWindow]
  });
  assert.equal(forkRequest.requestOnly, true);
  assert.equal(forkRequest.forkEffectPerformed, false);
  assert.equal(forkRequest.sourceHistoryMutation, false);
  assert.equal(JSON.stringify(f.projection), projectionBefore);

  const forkLie = canonicalClone(forkRequest);
  forkLie.requestedBranchClass = 'SHARED_ALTERNATE_HISTORY';
  rehash(forkLie, 'forkRequestSha256');
  assert.throws(() => verifyPrivateRehearsalForkRequest(forkLie), /PRIVATE_REHEARSAL/);

  const forgedForkOwner = canonicalClone(forkRequest);
  forgedForkOwner.formedByParticipantRef = 'participant.mallory';
  rehash(forgedForkOwner, 'forkRequestSha256');
  assert.throws(() => verifyPrivateRehearsalForkRequest(forgedForkOwner, {
    projection: f.projection,
    chronicle: f.chronicle,
    snapshot: f.snapshot,
    motionWindows: [f.motionWindow]
  }), /source context mismatch/);

  const saved = formSavedMomentDescriptor({
    projection: f.projection,
    chronicle: f.chronicle,
    snapshot: f.snapshot,
    motionWindows: [f.motionWindow],
    fromTick: 2,
    toTick: 3,
    includedEventRefs: [f.intent.eventRef, f.promoted.eventRef],
    includedMotionWindowRefs: [f.motionWindow.windowRef],
    purposeRef: 'purpose.world-memory.saved-fight-moment',
    requestedRetentionClass: 'EXPLICIT_SAVED_MOMENT',
    requestedStorageIntent: 'LOCAL_PRIVATE_ONLY'
  });
  verifySavedMomentDescriptor(saved, {
    projection: f.projection,
    chronicle: f.chronicle,
    snapshot: f.snapshot,
    motionWindows: [f.motionWindow]
  });
  assert.equal(saved.homeWritePerformed, false);
  assert.equal(saved.memoryWritePerformed, false);
  assert.equal(saved.vaultCommitPerformed, false);
  assert.equal(saved.wholeSessionRetentionRequested, false);

  assert.throws(() => formSavedMomentDescriptor({
    projection: f.projection,
    chronicle: f.chronicle,
    snapshot: f.snapshot,
    motionWindows: [f.motionWindow],
    fromTick: 1,
    toTick: 3,
    includedEventRefs: f.projection.includedEventRefs,
    includedMotionWindowRefs: f.projection.includedMotionWindowRefs,
    purposeRef: 'purpose.world-memory.archive-all',
    requestedRetentionClass: 'WHOLE_SESSION_ARCHIVE',
    requestedStorageIntent: 'LOCAL_PRIVATE_ONLY'
  }), /EXPLICIT_SAVED_MOMENT/);

  const retentionLie = canonicalClone(saved);
  retentionLie.wholeSessionRetentionRequested = true;
  rehash(retentionLie, 'savedMomentSha256');
  assert.throws(() => verifySavedMomentDescriptor(retentionLie), /must not claim storage\/promotion effects/);
});

test('external policy evidence authorizes exact capabilities only and revoke never deletes history', () => {
  const f = fixture();
  const projectionBefore = JSON.stringify(f.projection);

  const viewRequest = formWorldMemoryPermissionRequest({
    projection: f.projection,
    chronicle: f.chronicle,
    snapshot: f.snapshot,
    motionWindows: [f.motionWindow],
    chronicle: f.chronicle,
    snapshot: f.snapshot,
    motionWindows: [f.motionWindow],
    requesterParticipantRef: 'participant.victor',
    subjectParticipantRefs: ['participant.victor', 'participant.mira'],
    requestedCapabilityRefs: ['capability.world-memory.view'],
    purposeRef: 'purpose.world-memory.share-view',
    requestedAudienceRefs: ['participant.mira'],
    requestedRetentionClass: 'TRANSIENT_REPLAY',
    externalPolicyOwnerRef: 'policy.vexlife.relationships-consent'
  });

  const forgedRequest = canonicalClone(viewRequest);
  forgedRequest.requesterParticipantRef = 'participant.mallory';
  rehash(forgedRequest, 'permissionRequestSha256');
  assert.throws(() => formSyntheticExternalPolicyDecision({
    request: forgedRequest,
    projection: f.projection,
    chronicle: f.chronicle,
    snapshot: f.snapshot,
    motionWindows: [f.motionWindow],
    policyDecisionRef: 'policy-decision.world-memory.forged-request.0001',
    decisionClass: 'ALLOW',
    grantedCapabilityRefs: ['capability.world-memory.view'],
    audienceRefs: ['participant.mira'],
    currentnessRef: 'currentness.vexlife.relationships.forged.0001',
    consentRefOrNull: 'consent.world-memory.view.forged.0001'
  }), /permission request source projection mismatch/);

  const viewAllow = formSyntheticExternalPolicyDecision({
    request: viewRequest,
    projection: f.projection,
    chronicle: f.chronicle,
    snapshot: f.snapshot,
    motionWindows: [f.motionWindow],
    projection: f.projection,
    chronicle: f.chronicle,
    snapshot: f.snapshot,
    motionWindows: [f.motionWindow],
    policyDecisionRef: 'policy-decision.world-memory.view.0001',
    decisionClass: 'ALLOW',
    grantedCapabilityRefs: ['capability.world-memory.view'],
    audienceRefs: ['participant.mira'],
    currentnessRef: 'currentness.vexlife.relationships.0001',
    consentRefOrNull: 'consent.world-memory.view.0001'
  });
  verifyExternalPolicyDecision(viewAllow);

  const liveEvidenceLie = canonicalClone(viewAllow);
  liveEvidenceLie.evidenceClass = 'LIVE_VEXLIFE_POLICY_DECISION';
  rehash(liveEvidenceLie, 'policyDecisionSha256');
  assert.throws(
    () => verifyExternalPolicyDecision(liveEvidenceLie),
    /only synthetic external-policy fixture evidence/
  );

  const viewAuthorization = evaluateWorldMemoryAuthorization({
    request: viewRequest,
    decision: viewAllow,
    projection: f.projection,
    chronicle: f.chronicle,
    snapshot: f.snapshot,
    motionWindows: [f.motionWindow]
  });
  verifyWorldMemoryAuthorization(viewAuthorization, {
    request: viewRequest,
    decision: viewAllow,
    projection: f.projection,
    chronicle: f.chronicle,
    snapshot: f.snapshot,
    motionWindows: [f.motionWindow]
  });
  assert.deepEqual(viewAuthorization.effectiveCapabilityRefs, ['capability.world-memory.view']);
  assert.equal(viewAuthorization.effectiveCapabilityRefs.includes('capability.world-memory.fork-private'), false);
  assert.equal(viewAuthorization.effectiveCapabilityRefs.includes('capability.world-memory.redistribute'), false);
  assert.equal(viewAuthorization.relationshipMutationPerformed, false);
  assert.equal(viewAuthorization.homeWritePerformed, false);
  assert.equal(viewAuthorization.networkDeliveryPerformed, false);

  const capabilityEscalation = canonicalClone(viewAllow);
  capabilityEscalation.grantedCapabilityRefs = [
    'capability.world-memory.view',
    'capability.world-memory.redistribute'
  ];
  rehash(capabilityEscalation, 'policyDecisionSha256');
  assert.throws(() => evaluateWorldMemoryAuthorization({
    request: viewRequest,
    decision: capabilityEscalation,
    projection: f.projection,
    chronicle: f.chronicle,
    snapshot: f.snapshot,
    motionWindows: [f.motionWindow]
  }), /unrequested capability|ALLOW must grant the exact requested/);

  const friendShapedButNotDecision = {
    relationshipState: 'FRIEND',
    invitationState: 'VERIFIED_CURRENT',
    capability: 'capability.world-memory.view'
  };
  assert.throws(() => evaluateWorldMemoryAuthorization({
    request: viewRequest,
    decision: friendShapedButNotDecision,
    projection: f.projection,
    chronicle: f.chronicle,
    snapshot: f.snapshot,
    motionWindows: [f.motionWindow]
  }), /fields do not match contract|schema mismatch/);

  const wideRequest = formWorldMemoryPermissionRequest({
    projection: f.projection,
    chronicle: f.chronicle,
    snapshot: f.snapshot,
    motionWindows: [f.motionWindow],
    chronicle: f.chronicle,
    snapshot: f.snapshot,
    motionWindows: [f.motionWindow],
    requesterParticipantRef: 'participant.victor',
    subjectParticipantRefs: ['participant.victor', 'participant.mira'],
    requestedCapabilityRefs: [
      'capability.world-memory.view',
      'capability.world-memory.fork-private',
      'capability.world-memory.redistribute'
    ],
    purposeRef: 'purpose.world-memory.request-wide',
    requestedAudienceRefs: ['participant.mira'],
    requestedRetentionClass: 'EXPLICIT_SAVED_MOMENT',
    externalPolicyOwnerRef: 'policy.vexlife.relationships-consent'
  });

  const narrowed = formSyntheticExternalPolicyDecision({
    request: wideRequest,
    projection: f.projection,
    chronicle: f.chronicle,
    snapshot: f.snapshot,
    motionWindows: [f.motionWindow],
    projection: f.projection,
    chronicle: f.chronicle,
    snapshot: f.snapshot,
    motionWindows: [f.motionWindow],
    policyDecisionRef: 'policy-decision.world-memory.narrow.0001',
    decisionClass: 'NARROW',
    grantedCapabilityRefs: ['capability.world-memory.fork-private'],
    audienceRefs: [],
    currentnessRef: 'currentness.vexlife.relationships.0002',
    consentRefOrNull: null
  });
  const narrowedAuth = evaluateWorldMemoryAuthorization({
    request: wideRequest,
    decision: narrowed,
    projection: f.projection,
    chronicle: f.chronicle,
    snapshot: f.snapshot,
    motionWindows: [f.motionWindow]
  });
  assert.deepEqual(narrowedAuth.effectiveCapabilityRefs, ['capability.world-memory.fork-private']);
  assert.equal(narrowedAuth.effectiveCapabilityRefs.includes('capability.world-memory.redistribute'), false);

  const revoked = formSyntheticExternalPolicyDecision({
    request: viewRequest,
    projection: f.projection,
    chronicle: f.chronicle,
    snapshot: f.snapshot,
    motionWindows: [f.motionWindow],
    projection: f.projection,
    chronicle: f.chronicle,
    snapshot: f.snapshot,
    motionWindows: [f.motionWindow],
    policyDecisionRef: 'policy-decision.world-memory.revoke.0001',
    decisionClass: 'REVOKE',
    grantedCapabilityRefs: [],
    audienceRefs: [],
    currentnessRef: 'currentness.vexlife.relationships.revoked.0001',
    consentRefOrNull: null
  });
  const revokedAuth = evaluateWorldMemoryAuthorization({
    request: viewRequest,
    decision: revoked,
    projection: f.projection,
    chronicle: f.chronicle,
    snapshot: f.snapshot,
    motionWindows: [f.motionWindow]
  });
  assert.equal(revokedAuth.authorizationClass, 'REVOKED');
  assert.deepEqual(revokedAuth.effectiveCapabilityRefs, []);
  assert.equal(JSON.stringify(f.projection), projectionBefore);
  assert.equal(verifyWorldMemoryProjection(f.projection, {
    chronicle: f.chronicle,
    snapshot: f.snapshot,
    motionWindows: [f.motionWindow]
  }), f.projection);

  const authLie = canonicalClone(viewAuthorization);
  authLie.effectiveCapabilityRefs.push('capability.world-memory.redistribute');
  rehash(authLie, 'authorizationSha256');
  assert.throws(() => verifyWorldMemoryAuthorization(authLie, {
    request: viewRequest,
    decision: viewAllow,
    projection: f.projection,
    chronicle: f.chronicle,
    snapshot: f.snapshot,
    motionWindows: [f.motionWindow]
  }), /context mismatch/);

  assert.deepEqual(WORLD_MEMORY_CAPABILITIES, [
    'capability.world-memory.view',
    'capability.world-memory.replay',
    'capability.world-memory.fork-private',
    'capability.world-memory.fork-shared',
    'capability.world-memory.redistribute'
  ]);
});
