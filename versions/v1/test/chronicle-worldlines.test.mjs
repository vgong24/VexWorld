import test from 'node:test';
import assert from 'node:assert/strict';

import {
  FIGHT_EVENT_CLASSES,
  appendChronicleEvent,
  appendFightChronologyEvent,
  createChronicle,
  forkWorldline,
  formDeterminismEpoch,
  formIntelligenceDecision,
  formWorldInputFrame,
  replayWorldline,
  sealWorldSnapshot,
  verifyChronicle,
  verifyWorldSnapshot
} from '../src/core/chronicle/chronicle.mjs';
import {
  appendMotionSample,
  createMotionTail,
  expireMotionTail,
  promoteMotionWindow,
  verifyMotionTail,
  verifyMotionWindow
} from '../src/core/chronicle/motion-tail.mjs';
import { canonicalClone, hashCanonical } from '../src/core/chronicle/canonical.mjs';

const H = (character) => character.repeat(64);

function epoch() {
  return formDeterminismEpoch({
    epochRef: 'epoch.first-grove.chronicle-proof.v1',
    worldPackageFingerprint: H('a'),
    kernelRef: 'kernel.vexworld.chronicle-proof.v1',
    kernelSha256: H('b'),
    stateSchemaVersion: 'fixture.fight-state/v1',
    fixedStepMs: 1000 / 60,
    numericProfileRef: 'numeric.fixed-integer-millimeters.v1',
    rootSeed: 424242,
    rngStreamRefs: ['rng.fight', 'rng.fracture', 'rng.presentation']
  });
}

function initialFightState() {
  return {
    schemaVersion: 'fixture.fight-state/v1',
    tick: 0,
    fighters: {
      victor: { xMillimeters: 0, energy: 100, lastMoveRefOrNull: null },
      vex: { xMillimeters: 6000, energy: 100, lastMoveRefOrNull: null }
    },
    environment: {
      arenaWall: { integrity: 100, fractured: false, fractureSeedOrNull: null }
    },
    noticedRefs: [],
    acceptedIntentRefs: [],
    motionWindowRefs: [],
    rngStateByStream: { 'rng.fight': 11, 'rng.fracture': 22, 'rng.presentation': 33 }
  };
}

function fightReducer(prior, frame) {
  const state = canonicalClone(prior);
  state.tick = frame.tick;
  state.rngStateByStream = canonicalClone(frame.rngStateByStream);

  for (const action of [...frame.humanActionIntents, ...frame.companionIntents]) {
    if (action.kind === 'NOTICE') {
      if (!state.noticedRefs.includes(action.observationRef)) state.noticedRefs.push(action.observationRef);
    } else if (action.kind === 'INTENT') {
      if (!state.acceptedIntentRefs.includes(action.intentRef)) state.acceptedIntentRefs.push(action.intentRef);
    } else if (action.kind === 'MOVE_START') {
      state.fighters[action.fighterKey].lastMoveRefOrNull = action.moveRef;
      state.fighters[action.fighterKey].xMillimeters += action.displacementMillimeters;
    } else if (action.kind === 'HIT') {
      state.fighters[action.targetKey].energy = Math.max(0, state.fighters[action.targetKey].energy - action.damage);
    }
  }

  for (const event of frame.scheduledWorldEvents) {
    if (event.kind === 'FRACTURE') {
      state.environment.arenaWall.integrity = Math.max(0, state.environment.arenaWall.integrity + event.integrityDelta);
      if (state.environment.arenaWall.integrity === 0) {
        state.environment.arenaWall.fractured = true;
        state.environment.arenaWall.fractureSeedOrNull = event.fractureSeed;
      }
    }
  }

  for (const motionWindowRef of frame.motionWindowRefs) {
    if (!state.motionWindowRefs.includes(motionWindowRef)) state.motionWindowRefs.push(motionWindowRef);
  }
  return state;
}

function frame(branchRef, tick, {
  humanActionIntents = [],
  companionIntents = [],
  scheduledWorldEvents = [],
  motionWindowRefs = []
} = {}) {
  return formWorldInputFrame({
    branchRef,
    tick,
    humanActionIntents,
    companionIntents,
    scheduledWorldEvents,
    motionWindowRefs,
    rngStateByStream: {
      'rng.fight': 11 + tick,
      'rng.fracture': 22 + tick,
      'rng.presentation': 33 + tick
    }
  });
}

function parentFrames(branchRef = 'worldline.first-grove.verified') {
  return [
    frame(branchRef, 1, {
      humanActionIntents: [{
        actionRef: 'action.notice.wall.0001',
        kind: 'NOTICE',
        observationRef: 'observation.victor.arena-wall.0001',
        observerRef: 'participant.victor',
        targetRef: 'entity.arena-wall'
      }]
    }),
    frame(branchRef, 2, {
      humanActionIntents: [{
        actionRef: 'action.intent.dragon-rush.0001',
        kind: 'INTENT',
        intentRef: 'intent.victor.dragon-rush.0001',
        participantRef: 'participant.victor',
        moveRef: 'move.dragon-rush'
      }]
    }),
    frame(branchRef, 3, {
      humanActionIntents: [{
        actionRef: 'action.start.dragon-rush.0001',
        kind: 'MOVE_START',
        fighterKey: 'victor',
        moveRef: 'move.dragon-rush',
        displacementMillimeters: 4200
      }]
    }),
    frame(branchRef, 4, {
      humanActionIntents: [{
        actionRef: 'action.hit.dragon-rush.0001',
        kind: 'HIT',
        sourceKey: 'victor',
        targetKey: 'vex',
        damage: 35
      }]
    }),
    frame(branchRef, 5, {
      scheduledWorldEvents: [{
        eventRef: 'event.fracture.arena-wall.0001',
        kind: 'FRACTURE',
        targetRef: 'entity.arena-wall',
        integrityDelta: -100,
        fractureSeed: 778899
      }],
      motionWindowRefs: ['motion-window.victor.dragon-rush.0001']
    })
  ];
}

function rehashEvent(event) {
  const { eventSha256: _ignored, ...body } = event;
  return { ...body, eventSha256: hashCanonical(body) };
}

function rehashSnapshot(snapshot) {
  const clone = canonicalClone(snapshot);
  clone.canonicalStateSha256 = hashCanonical(clone.canonicalState);
  clone.snapshotRef = `${clone.branchRef}.snapshot.${String(clone.tick).padStart(12, '0')}.${clone.canonicalStateSha256.slice(0, 12)}`;
  const { snapshotSha256: _ignored, ...body } = clone;
  clone.snapshotSha256 = hashCanonical(body);
  return clone;
}

function rehashMotionSample(sample) {
  const clone = canonicalClone(sample);
  const { sampleSha256: _ignored, ...body } = clone;
  clone.sampleSha256 = hashCanonical(body);
  return clone;
}

function rehashMotionWindow(window) {
  const clone = canonicalClone(window);
  const { motionWindowSha256: _ignored, ...body } = clone;
  clone.motionWindowSha256 = hashCanonical(body);
  return clone;
}

test('determinism epoch and input frame hashes are canonical across object key order', () => {
  const a = epoch();
  const b = formDeterminismEpoch({
    rngStreamRefs: ['rng.fight', 'rng.fracture', 'rng.presentation'],
    rootSeed: 424242,
    numericProfileRef: 'numeric.fixed-integer-millimeters.v1',
    fixedStepMs: 1000 / 60,
    stateSchemaVersion: 'fixture.fight-state/v1',
    kernelSha256: H('b'),
    kernelRef: 'kernel.vexworld.chronicle-proof.v1',
    worldPackageFingerprint: H('a'),
    epochRef: 'epoch.first-grove.chronicle-proof.v1'
  });
  assert.equal(a.epochSha256, b.epochSha256);

  const left = frame('worldline.first-grove.verified', 1, {
    humanActionIntents: [{ actionRef: 'action.a', kind: 'NOTICE', nested: { z: 1, a: 2 } }]
  });
  const right = frame('worldline.first-grove.verified', 1, {
    humanActionIntents: [{ nested: { a: 2, z: 1 }, kind: 'NOTICE', actionRef: 'action.a' }]
  });
  assert.equal(left.inputFrameSha256, right.inputFrameSha256);
});

test('Chronicle forms a contiguous hash-linked fight history and rejects tamper or reorder', () => {
  const determinismEpoch = epoch();
  let chronicle = createChronicle({
    timelineRef: 'timeline.first-grove.fight.0001',
    branchRef: 'worldline.first-grove.verified',
    epoch: determinismEpoch
  });

  const events = [
    ['OBSERVATION_DELIVERED', 1, 0, 'participant.victor', { observationRef: 'observation.victor.arena-wall.0001', targetRef: 'entity.arena-wall' }],
    ['INTENT_ACCEPTED', 2, 0, 'participant.victor', { intentRef: 'intent.victor.dragon-rush.0001', moveRef: 'move.dragon-rush' }],
    ['ACTION_STARTED', 3, 0, 'participant.victor', { actionRef: 'action.start.dragon-rush.0001', moveRef: 'move.dragon-rush' }],
    ['HIT_RESOLVED', 4, 0, 'system.vexworld.combat', { actionRef: 'action.hit.dragon-rush.0001', targetRef: 'participant.vex', damage: 35 }],
    ['ENVIRONMENT_FRACTURED', 5, 0, 'system.vexworld.environment', { targetRef: 'entity.arena-wall', fractureSeed: 778899 }],
    ['MOTION_WINDOW_PROMOTED', 5, 1, 'system.vexworld.chronicle', { motionWindowRef: 'motion-window.victor.dragon-rush.0001' }]
  ];
  assert.deepEqual(events.map(([eventClass]) => eventClass), [...FIGHT_EVENT_CLASSES].filter((value) => value !== 'DESTRUCTION_SETTLED'));

  for (const [eventClass, tick, ordinal, actorRef, payload] of events) {
    chronicle = appendFightChronologyEvent(chronicle, {
      tick,
      ordinal,
      actorRef,
      eventClass,
      privacyClass: eventClass === 'MOTION_WINDOW_PROMOTED' ? 'PARTICIPANT_PRIVATE' : 'PARTY_SHARED',
      causationRefs: [],
      correlationRefOrNull: 'correlation.fight.0001',
      payload
    }).chronicle;
  }
  assert.equal(verifyChronicle(chronicle), chronicle);
  assert.equal(chronicle.events.length, 6);
  assert.equal(chronicle.headSha256, chronicle.events.at(-1).eventSha256);

  const tampered = canonicalClone(chronicle);
  tampered.events[3].payload.damage = 99;
  assert.throws(() => verifyChronicle(tampered), /payload digest mismatch/);

  const reordered = canonicalClone(chronicle);
  [reordered.events[1], reordered.events[2]] = [reordered.events[2], reordered.events[1]];
  assert.throws(() => verifyChronicle(reordered), /prior hash mismatch|order mismatch/);

  assert.throws(() => appendChronicleEvent(chronicle, {
    tick: 5,
    ordinal: 3,
    actorRef: 'system.vexworld.chronicle',
    eventClass: 'DESTRUCTION_SETTLED',
    privacyClass: 'PARTY_SHARED',
    causationRefs: [],
    correlationRefOrNull: null,
    payload: { targetRef: 'entity.arena-wall' }
  }), /contiguous/);
});

test('Chronicle verifier rejects rehashed event epoch, hidden-reasoning and contract drift', () => {
  const determinismEpoch = epoch();
  let chronicle = createChronicle({
    timelineRef: 'timeline.first-grove.verifier.0001',
    branchRef: 'worldline.first-grove.verified',
    epoch: determinismEpoch
  });
  chronicle = appendChronicleEvent(chronicle, {
    tick: 1,
    ordinal: 0,
    actorRef: 'participant.victor',
    eventClass: 'INTENT_ACCEPTED',
    privacyClass: 'PARTY_SHARED',
    causationRefs: [],
    correlationRefOrNull: null,
    payload: { intentRef: 'intent.victor.test.0001' }
  }).chronicle;

  const crossedEpoch = canonicalClone(chronicle);
  crossedEpoch.events[0].determinismEpochRef = 'epoch.crossed.invalid';
  crossedEpoch.events[0] = rehashEvent(crossedEpoch.events[0]);
  crossedEpoch.headSha256 = crossedEpoch.events[0].eventSha256;
  assert.throws(() => verifyChronicle(crossedEpoch), /determinism epoch mismatch/);

  const hiddenReasoning = canonicalClone(chronicle);
  hiddenReasoning.events[0].payload.privateReasoning = 'rehashing must not make this admissible';
  hiddenReasoning.events[0].payloadSha256 = hashCanonical(hiddenReasoning.events[0].payload);
  hiddenReasoning.events[0] = rehashEvent(hiddenReasoning.events[0]);
  hiddenReasoning.headSha256 = hiddenReasoning.events[0].eventSha256;
  assert.throws(() => verifyChronicle(hiddenReasoning), /hidden-reasoning/);

  const extraField = canonicalClone(chronicle);
  extraField.events[0].uncontractedField = 'not-admitted';
  extraField.events[0] = rehashEvent(extraField.events[0]);
  extraField.headSha256 = extraField.events[0].eventSha256;
  assert.throws(() => verifyChronicle(extraField), /fields do not match contract/);
});

test('snapshot replay is deterministic, invokes no model, and a fork cannot mutate its parent', () => {
  const determinismEpoch = epoch();
  const verifiedBranchRef = 'worldline.first-grove.verified';
  const frames = parentFrames(verifiedBranchRef);
  let parentAt0 = createChronicle({
    timelineRef: 'timeline.first-grove.fight.0002',
    branchRef: verifiedBranchRef,
    epoch: determinismEpoch
  });
  const snapshot0 = sealWorldSnapshot({ chronicle: parentAt0, tick: 0, canonicalState: initialFightState() });
  verifyWorldSnapshot(snapshot0, { epoch: determinismEpoch, chronicle: parentAt0 });

  let modelCalls = 0;
  const replayTo3 = replayWorldline({
    snapshot: snapshot0,
    sourceChronicle: parentAt0,
    epoch: determinismEpoch,
    targetBranchRef: verifiedBranchRef,
    inputFrames: frames.slice(0, 3),
    reducer(state, inputFrame) {
      assert.equal(modelCalls, 0);
      return fightReducer(state, inputFrame);
    }
  });
  assert.equal(modelCalls, 0);
  assert.equal(replayTo3.inputMode, 'RECORDED_INPUT_FRAMES_ONLY');
  assert.equal(replayTo3.finalTick, 3);

  const chronology = [
    ['OBSERVATION_DELIVERED', 1, 'participant.victor', { observationRef: 'observation.victor.arena-wall.0001' }],
    ['INTENT_ACCEPTED', 2, 'participant.victor', { intentRef: 'intent.victor.dragon-rush.0001' }],
    ['ACTION_STARTED', 3, 'participant.victor', { actionRef: 'action.start.dragon-rush.0001' }]
  ];
  for (const [eventClass, tick, actorRef, payload] of chronology) {
    parentAt0 = appendFightChronologyEvent(parentAt0, {
      tick,
      ordinal: 0,
      actorRef,
      eventClass,
      privacyClass: 'PARTY_SHARED',
      causationRefs: [],
      correlationRefOrNull: 'correlation.fight.0002',
      payload
    }).chronicle;
  }
  const snapshot3 = sealWorldSnapshot({ chronicle: parentAt0, tick: 3, canonicalState: replayTo3.finalState });
  const parentBytesBeforeFork = JSON.stringify(parentAt0);

  const fork = forkWorldline({
    parentChronicle: parentAt0,
    snapshot: snapshot3,
    branchRef: 'worldline.first-grove.private-rehearsal.0001',
    branchClass: 'PRIVATE_REHEARSAL',
    formedByRef: 'participant.victor',
    purposeRef: 'purpose.rehearse-defensive-response',
    assumptionRefs: ['assumption.vex-guards-instead-of-taking-hit']
  });
  assert.equal(JSON.stringify(parentAt0), parentBytesBeforeFork);
  assert.equal(fork.branch.parentBranchRef, verifiedBranchRef);
  assert.equal(fork.branch.baseEventHeadSha256, snapshot3.eventHeadSha256);

  const verifiedResult = replayWorldline({
    snapshot: snapshot3,
    sourceChronicle: parentAt0,
    epoch: determinismEpoch,
    targetBranchRef: verifiedBranchRef,
    inputFrames: frames.slice(3),
    reducer: fightReducer
  });

  const alternateFrames = [
    frame(fork.branch.branchRef, 4, {
      companionIntents: [{
        intentRef: 'intent.vex.guard.0001',
        kind: 'MOVE_START',
        fighterKey: 'vex',
        moveRef: 'move.guard',
        displacementMillimeters: -600
      }]
    }),
    frame(fork.branch.branchRef, 5, {
      scheduledWorldEvents: [{
        eventRef: 'event.fracture.arena-wall.avoided',
        kind: 'FRACTURE',
        targetRef: 'entity.arena-wall',
        integrityDelta: -25,
        fractureSeed: 778899
      }]
    })
  ];
  const alternateResult = replayWorldline({
    snapshot: snapshot3,
    sourceChronicle: parentAt0,
    epoch: determinismEpoch,
    targetBranchRef: fork.branch.branchRef,
    inputFrames: alternateFrames,
    reducer: fightReducer
  });

  assert.equal(verifiedResult.finalState.environment.arenaWall.fractured, true);
  assert.equal(alternateResult.finalState.environment.arenaWall.fractured, false);
  assert.notEqual(verifiedResult.finalStateSha256, alternateResult.finalStateSha256);
  assert.equal(JSON.stringify(parentAt0), parentBytesBeforeFork, 'branch replay must not mutate parent Chronicle');

  const repeated = replayWorldline({
    snapshot: snapshot3,
    sourceChronicle: parentAt0,
    epoch: determinismEpoch,
    targetBranchRef: verifiedBranchRef,
    inputFrames: frames.slice(3),
    reducer: fightReducer,
    expectedStateSha256OrNull: verifiedResult.finalStateSha256
  });
  assert.equal(repeated.finalStateSha256, verifiedResult.finalStateSha256);
});

test('snapshot ancestry verifier rejects rehashed false timeline, tick and eventCount before fork or replay', () => {
  const determinismEpoch = epoch();
  const branchRef = 'worldline.first-grove.verified';
  let parent = createChronicle({
    timelineRef: 'timeline.first-grove.snapshot-verifier.0001',
    branchRef,
    epoch: determinismEpoch
  });
  parent = appendChronicleEvent(parent, {
    tick: 1,
    ordinal: 0,
    actorRef: 'participant.victor',
    eventClass: 'INTENT_ACCEPTED',
    privacyClass: 'PARTY_SHARED',
    causationRefs: [],
    correlationRefOrNull: null,
    payload: { intentRef: 'intent.victor.snapshot-test.0001' }
  }).chronicle;
  const state = { ...initialFightState(), tick: 1 };
  const snapshot = sealWorldSnapshot({ chronicle: parent, tick: 1, canonicalState: state });

  const falseTimeline = canonicalClone(snapshot);
  falseTimeline.timelineRef = 'timeline.forged.but-rehashed';
  const rehashedTimeline = rehashSnapshot(falseTimeline);
  assert.throws(() => forkWorldline({
    parentChronicle: parent,
    snapshot: rehashedTimeline,
    branchRef: 'worldline.first-grove.private-rehearsal.timeline-forgery',
    branchClass: 'PRIVATE_REHEARSAL',
    formedByRef: 'participant.victor',
    purposeRef: 'purpose.test',
    assumptionRefs: []
  }), /Chronicle ancestry mismatch/);

  const falseTick = canonicalClone(snapshot);
  falseTick.tick = 2;
  const rehashedTick = rehashSnapshot(falseTick);
  assert.throws(() => replayWorldline({
    snapshot: rehashedTick,
    sourceChronicle: parent,
    epoch: determinismEpoch,
    targetBranchRef: branchRef,
    inputFrames: [],
    reducer: fightReducer
  }), /Chronicle ancestry mismatch/);

  const falseEventCount = canonicalClone(snapshot);
  falseEventCount.eventCount = 999;
  const rehashedEventCount = rehashSnapshot(falseEventCount);
  assert.throws(() => replayWorldline({
    snapshot: rehashedEventCount,
    sourceChronicle: parent,
    epoch: determinismEpoch,
    targetBranchRef: branchRef,
    inputFrames: [],
    reducer: fightReducer
  }), /Chronicle ancestry mismatch/);
});

test('motion hot tail quantizes, bounds, expires and promotes only consented material windows', () => {
  let tail = createMotionTail({
    tailRef: 'motion-tail.victor.headset.0001',
    participantRef: 'participant.victor',
    coordinateSpaceRef: 'space.first-grove.arena',
    maxSamples: 3,
    maxAgeTicks: 2,
    privacyClass: 'PARTICIPANT_PRIVATE',
    retentionClass: 'EPHEMERAL_HOT_TAIL'
  });

  const pose = (x, y, z) => ({
    positionMeters: { x, y, z },
    orientationQuaternion: { x: 0, y: 0, z: 0, w: 1 },
    linearVelocityMetersPerSecondOrNull: { x: 0.5, y: 0, z: -0.25 },
    angularVelocityRadiansPerSecondOrNull: null
  });

  for (let index = 1; index <= 5; index += 1) {
    tail = appendMotionSample(tail, {
      sequence: index,
      tick: index,
      sourceRef: 'sensor.synthetic.vr-headset',
      pose: pose(index / 10, 1.75, -index / 20),
      materialityRefs: index >= 3 ? ['materiality.fight.dragon-rush'] : []
    }).tail;
  }
  verifyMotionTail(tail);
  assert.deepEqual(tail.samples.map((sample) => sample.tick), [3, 4, 5]);
  assert.equal(tail.samples[0].pose.positionMillimeters.x, 300);

  assert.throws(() => appendMotionSample(tail, {
    sequence: 5,
    tick: 6,
    sourceRef: 'sensor.synthetic.vr-headset',
    pose: pose(0, 0, 0),
    materialityRefs: []
  }), /sequence must increase/);

  assert.throws(() => promoteMotionWindow(tail, {
    windowRef: 'motion-window.victor.dragon-rush.shared-without-consent',
    fromTick: 3,
    toTick: 5,
    reasonRef: 'reason.environment-fracture-causality',
    consentRefOrNull: null,
    privacyClass: 'PARTY_SHARED',
    retentionClass: 'EVENT_EVIDENCE',
    eventRefs: ['worldline.first-grove.verified.event.000000000005.000000']
  }), /consent/);

  const window = promoteMotionWindow(tail, {
    windowRef: 'motion-window.victor.dragon-rush.0001',
    fromTick: 3,
    toTick: 5,
    reasonRef: 'reason.environment-fracture-causality',
    consentRefOrNull: 'consent.victor.party-replay.0001',
    privacyClass: 'PARTY_SHARED',
    retentionClass: 'EVENT_EVIDENCE',
    eventRefs: ['worldline.first-grove.verified.event.000000000005.000000']
  });
  verifyMotionWindow(window);
  assert.equal(window.sampleCount, 3);
  const { motionWindowSha256, ...windowBody } = canonicalClone(window);
  assert.equal(motionWindowSha256, hashCanonical(windowBody));
});

test('motion verifiers reject rehashed durable live tails, invalid quantized samples and consent-stripped shared windows', () => {
  let tail = createMotionTail({
    tailRef: 'motion-tail.victor.verifier.0001',
    participantRef: 'participant.victor',
    coordinateSpaceRef: 'space.first-grove.arena',
    maxSamples: 4,
    maxAgeTicks: 4,
    privacyClass: 'PARTICIPANT_PRIVATE',
    retentionClass: 'EPHEMERAL_HOT_TAIL'
  });
  tail = appendMotionSample(tail, {
    sequence: 1,
    tick: 10,
    sourceRef: 'sensor.synthetic.vr-headset',
    pose: {
      positionMeters: { x: 0.1, y: 1.7, z: -0.2 },
      orientationQuaternion: { x: 0, y: 0, z: 0, w: 1 },
      linearVelocityMetersPerSecondOrNull: null,
      angularVelocityRadiansPerSecondOrNull: null
    },
    materialityRefs: ['materiality.fight.verifier']
  }).tail;

  const durableTail = canonicalClone(tail);
  durableTail.retentionClass = 'EVENT_EVIDENCE';
  assert.throws(() => verifyMotionTail(durableTail), /EPHEMERAL_HOT_TAIL/);

  const invalidSampleTail = canonicalClone(tail);
  invalidSampleTail.samples[0].pose.positionMillimeters.x = 12.5;
  invalidSampleTail.samples[0] = rehashMotionSample(invalidSampleTail.samples[0]);
  assert.throws(() => verifyMotionTail(invalidSampleTail), /safe integer/);

  const sharedWindow = promoteMotionWindow(tail, {
    windowRef: 'motion-window.victor.verifier.0001',
    fromTick: 10,
    toTick: 10,
    reasonRef: 'reason.verifier-proof',
    consentRefOrNull: 'consent.victor.party-replay.verifier',
    privacyClass: 'PARTY_SHARED',
    retentionClass: 'EVENT_EVIDENCE',
    eventRefs: ['event.verifier.0001']
  });
  const consentStripped = canonicalClone(sharedWindow);
  consentStripped.consentRefOrNull = null;
  const rehashedWindow = rehashMotionWindow(consentStripped);
  assert.throws(() => verifyMotionWindow(rehashedWindow), /consent/);
});

test('motion promotion digest is stable and expiry does not rewrite a promoted window', () => {
  let tail = createMotionTail({
    tailRef: 'motion-tail.vex.controller.0001',
    participantRef: 'participant.vex',
    coordinateSpaceRef: 'space.first-grove.arena',
    maxSamples: 8,
    maxAgeTicks: 8,
    privacyClass: 'PARTICIPANT_PRIVATE',
    retentionClass: 'EPHEMERAL_HOT_TAIL'
  });
  const pose = {
    positionMeters: { x: 1, y: 2, z: 3 },
    orientationQuaternion: { x: 0, y: 0, z: 0, w: 1 },
    linearVelocityMetersPerSecondOrNull: null,
    angularVelocityRadiansPerSecondOrNull: null
  };
  for (let sequence = 1; sequence <= 3; sequence += 1) {
    tail = appendMotionSample(tail, {
      sequence,
      tick: 10 + sequence,
      sourceRef: 'sensor.synthetic.controller',
      pose,
      materialityRefs: ['materiality.fight.guard']
    }).tail;
  }
  const input = {
    windowRef: 'motion-window.vex.guard.0001',
    fromTick: 11,
    toTick: 13,
    reasonRef: 'reason.hit-resolution',
    consentRefOrNull: null,
    privacyClass: 'PARTICIPANT_PRIVATE',
    retentionClass: 'EXPLICIT_SAVED_MOMENT',
    eventRefs: ['event.hit-resolution.0001']
  };
  const first = promoteMotionWindow(tail, input);
  const second = promoteMotionWindow(tail, input);
  assert.equal(first.motionWindowSha256, second.motionWindowSha256);
  const expired = expireMotionTail(tail, 100);
  assert.equal(expired.samples.length, 0);
  assert.equal(first.sampleCount, 3);
  assert.equal(verifyMotionWindow(first), first);
});

test('intelligence decision records bounded causal evidence and rejects hidden reasoning', () => {
  const decision = formIntelligenceDecision({
    participantRef: 'participant.vex',
    workerRef: 'worker.vex.local.0001',
    sourceObservationRef: 'observation.vex.fight.0001',
    sourceObservationSha256: H('c'),
    visibleContextRefs: ['context.first-grove.fight-affordances'],
    controllerRef: 'controller.vex.local-model.v1',
    modelIdentityOrNull: {
      modelRef: 'model.devex.g0',
      modelDigest: H('d')
    },
    proposedIntent: { intentType: 'GUARD', targetRef: null },
    acceptedIntentOrNull: { intentType: 'GUARD', targetRef: null },
    rejectionReasonOrNull: null,
    conciseReasonOrNull: 'The incoming rush is close; I guard.'
  });
  assert.equal(decision.acceptedIntentOrNull.intentType, 'GUARD');
  assert.ok(decision.decisionSha256);

  assert.throws(() => formIntelligenceDecision({
    participantRef: 'participant.vex',
    workerRef: 'worker.vex.local.0001',
    sourceObservationRef: 'observation.vex.fight.0001',
    sourceObservationSha256: H('c'),
    visibleContextRefs: [],
    controllerRef: 'controller.vex.local-model.v1',
    modelIdentityOrNull: null,
    proposedIntent: {
      intentType: 'GUARD',
      privateReasoning: 'unbounded hidden trace must not enter Chronicle'
    },
    acceptedIntentOrNull: null,
    rejectionReasonOrNull: 'reason.not-afforded',
    conciseReasonOrNull: null
  }), /hidden-reasoning/);
});
