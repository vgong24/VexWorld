# Vex Chronicle and Worldlines

`[VXG RealForever]`

```text
architectureRef=architecture.vexworld.chronicle-worldlines/v1
programRef=github.issue.vexworld.72
stageRef=github.issue.vexworld.73
firstImplementationRef=stage.vexworld.vw-fwd-07a
```

## Decision

VexWorld will treat time as a first-class causal structure rather than a sequence of replaceable save files.

```text
VEX CHRONICLE
  append-only verified history

WORLDLINE
  one branch descended from an exact Chronicle point

WORLD MEMORY
  later human-facing replay, comparison and rehearsal experience

TRAJECTORY
  one assumption-bound possible future; never a fact

PRESENTATION CACHE
  renderer/audio/camera/particle projection; never canonical world meaning
```

Permanent non-collapse:

```text
CHECKPOINT != COMPLETE_HISTORY
WALL_CLOCK != WORLD_CLOCK
REPLAY != MODEL_REINFERENCE
REWIND != DELETE_OR_REWRITE_THE_FUTURE
FORK != CHANGE_THE_PAST
FORECAST != FACT
RECORDED_INTENT != CHAIN_OF_THOUGHT
MOTION_STREAM != IDENTITY_OR_WORTH
RENDERED_FRAME != WORLD_STATE
```

## Why this belongs after the accepted Version 1 route

Version 1 already proves several required foundations:

```text
fixed-step world advancement
simulation time and tick state
seeded random state
World Package fingerprinting
one authoritative host lease
versioned checkpoint persistence
observer-relative companion observations
bounded semantic companion intents
model identity/digest evidence
headless realm continuity
```

The current `SessionStore` is deliberately a current-state relay. It retains one latest checkpoint and one latest observation/intent/utterance per participant. That is enough for bounded continuity, but not enough to reconstruct a complete fight, prove exactly which accepted input caused an environment fracture, or form a branch without overwriting history.

Stage 07A therefore adds an isolated Chronicle kernel beside the accepted runtime. It does not yet replace `SessionStore` or change live play.

## Canonical transition

The long-term world transition is:

```text
prior canonical state
+ ordered WorldInputFrame
+ exact DeterminismEpoch
= next canonical state
+ ordered Chronicle events
+ canonical state hash
```

No ambient source may enter canonical evolution:

```text
no Date.now() as world truth
no network read inside the reducer
no direct model call inside the reducer
no hidden random source
no renderer state as world law
```

Wall-clock timestamps may remain operational metadata such as receipt or transport time. They do not order fictional-world causality.

## Determinism epoch

Every replay binds an exact execution epoch:

```text
DeterminismEpoch {
  epochRef
  worldPackageFingerprint
  kernelRef
  kernelSha256
  stateSchemaVersion
  fixedStepMs
  numericProfileRef
  rootSeed
  rngStreamRefs[]
  epochSha256
}
```

An epoch change is explicit. A replay may not silently cross a world-package, reducer, state-schema, numeric-profile or random-stream change.

## Input frames

One ordered input frame covers one simulation tick:

```text
WorldInputFrame {
  branchRef
  tick
  humanActionIntents[]
  companionIntents[]
  scheduledWorldEvents[]
  motionWindowRefs[]
  rngStateByStream
  inputFrameSha256
}
```

Arrays retain their accepted order. The frame is the only canonical input surface for the reducer.

Physical controls are translated before admission:

```text
button / stick / hand pose / voice gesture
→ semantic proposal
→ authority + affordance validation
→ accepted intent in WorldInputFrame
```

## Chronicle event

Each accepted event binds:

```text
branchRef
tick
ordinal within tick
actorRef
eventClass
privacyClass
causationRefs[]
correlationRefOrNull
determinism epoch
payload + payload hash
prior event hash
event hash
```

Events form a contiguous append-only hash chain. Tampering, reordering, missing ordinals and divergent prior heads fail verification.

The first fight-oriented vocabulary includes:

```text
OBSERVATION_DELIVERED
INTENT_ACCEPTED
ACTION_STARTED
HIT_RESOLVED
ENVIRONMENT_FRACTURED
DESTRUCTION_SETTLED
MOTION_WINDOW_PROMOTED
```

`OBSERVATION_DELIVERED` means that bounded information became available to one observer. It does not prove attention, awareness, belief or an inner mental state.

## Snapshot and replay

A snapshot binds:

```text
branch coordinate
tick
epoch
world-package fingerprint
Chronicle event head
canonical state
canonical state hash
snapshot hash
```

The minimum replay proof is:

```text
same epoch
+ same snapshot
+ same contiguous ordered input frames
= same final canonical state hash
```

Historical replay consumes the recorded accepted intent stream. It does not ask a human, controller or model to choose again.

## Intelligence provenance

A bounded intelligence decision may record:

```text
participantRef
workerRef
source observation ref/hash
visible context refs
controller ref
model ref/digest when used
proposed intent
accepted intent or rejection
bounded concise reason
```

It must not contain hidden chain-of-thought, private reasoning traces or unbounded model context.

```text
MODEL PROPOSAL
→ validation
→ accepted or rejected intent
→ Chronicle boundary event
→ deterministic world transition
```

A new inference made from an old observation belongs to a new Worldline. It cannot replace the original historical choice.

## Worldline fork

A fork binds:

```text
new branch ref/class
parent branch ref
fork tick
base snapshot ref/hash
parent event-head hash
exact determinism epoch
formed-by and purpose refs
explicit assumptions
```

Parent bytes remain unchanged. A fork begins from the parent event head and appends only new branch events.

Initial branch classes:

```text
VERIFIED_CANONICAL
NETWORK_PREDICTION
PRIVATE_REHEARSAL
SHARED_ALTERNATE_HISTORY
TRAJECTORY_FORECAST
MEDIA_RECONSTRUCTION
TEST_FIXTURE
```

## Budokai-style fight reconstruction

A reconstructable fight does not need to store every rendered frame as world truth. It needs the causal layers:

```text
1. exact initial snapshot
2. ordered semantic input frames
3. accepted observation/intent/action/hit events
4. material motion windows
5. deterministic random-stream positions
6. environment fracture profile and seed
7. resulting canonical entity/field state
8. renderer/presentation profile or retained visual cache
```

Example:

```text
tick 1200  OBSERVATION_DELIVERED  wall and opponent available to Victor

tick 1204  INTENT_ACCEPTED       dragon-rush intent accepted

tick 1206  ACTION_STARTED        attack state begins

tick 1212  HIT_RESOLVED          target and impulse resolve

tick 1213  ENVIRONMENT_FRACTURED wall integrity reaches zero;
                                      fracture profile + seed bind result

tick 1213  MOTION_WINDOW_PROMOTED exact material headset/controller window retained
```

The visual replay may regenerate camera shake, sparks and cosmetic debris. Gameplay-affecting fragments remain canonical entities or fields.

## Motion hot tail

High-frequency XR/body/controller capture begins as a bounded ephemeral tail:

```text
recent local ring buffer
→ deterministic quantization
→ bounded count and tick age
→ no automatic public retention
→ exact event window promoted only when materially implicated or explicitly saved
```

Stage 07A proves only a synthetic primitive:

```text
position → integer millimeters
orientation → integer micro-quaternion components
velocity → integer millimeters/microradians per second
sequence and tick monotonicity
stable promoted-window hash
privacy and retention classification
consent required for shared/public promotion
```

Later real capture must additionally qualify device identity, clock alignment, calibration, transport loss, encryption, participant visibility and retention policy.

```text
HOT_TAIL != SESSION_ARCHIVE
GAZE_OR_POSE != PUBLIC_HISTORY
MOTION_CAPTURE != BIOMETRIC_CLASSIFICATION
```

## Particles, destruction and fluids

### Gameplay material

Anything that can damage, block, collide, trigger, carry, alter navigation or affect world rules is canonical state.

### Cosmetic presentation

Sparks, dust, camera shake, shader fragments and non-interacting debris are regenerated from event + seed + presentation profile or played from a retained cache.

### Water and continuous simulation

Do not reverse-integrate turbulent systems. Use:

```text
nearest retained simulation checkpoint
+ exact accepted input stream
→ forward resimulation
```

or a retained simulation cache.

Canonical gameplay water should remain a deterministic coarse field (volume, flow, hazard, buoyancy, navigation). High-fidelity fluid simulation and visual water remain adapters.

## Multiplayer future route

A later stage may maintain:

```text
VERIFIED HEAD
  all required inputs accepted

PREDICTED HEAD
  simulated ahead under declared predictions
```

Late divergent input triggers restore + replay within a bounded rollback window. Prediction history is not accepted Chronicle history until reconciled.

## Privacy classes

Chronicle events use explicit classes:

```text
PUBLIC_WORLD
PARTY_SHARED
PARTICIPANT_PRIVATE
SYSTEM_PROOF
EXTERNAL_EFFECT_PROTECTED
EPHEMERAL_PRESENTATION
```

A shared replay must not expose private Home/Memory material, hidden model context, credentials, unshared voice, private motion, or relationship-private annotations.

## External effects

Virtual rewind cannot undo an effect outside the simulated world:

```text
message sent
publication
purchase
file deletion
physical device action
external API mutation
```

A later generic Chronicle contract should preserve separate external-effect receipts. Branching from before such an event does not erase the receipt or claim the external world was reversed.

## Stage 07A source boundary

```text
docs/architecture/CHRONICLE-WORLDLINES.md
versions/v1/config/source-map.fragments/stage-07a-chronicle-worldlines.json
versions/v1/src/core/chronicle/canonical.mjs
versions/v1/src/core/chronicle/chronicle.mjs
versions/v1/src/core/chronicle/motion-tail.mjs
versions/v1/test/chronicle-worldlines.test.mjs
config/project-state.json
```

The first implementation is intentionally isolated and reusable. It does not yet modify:

```text
engine.mjs
runtime-state.mjs
session-store.mjs
headless-realm-host.mjs
remote-worker.mjs
browser UI
Godot adapter
```

That reconnection is earned only after exact replay/fork evidence passes and receives fresh review.

## Proof target

The focused test proves:

```text
canonical epoch/frame hashing
contiguous Chronicle chain
tamper/reorder rejection
snapshot integrity
recorded-input replay equality
zero model reinference in the replay fixture
fork ancestry and parent immutability
bounded motion tail eviction
consent-bound window promotion
fight + environment fracture chronology
hidden-reasoning rejection
```

Passing this proof establishes a kernel contract. It does not yet prove live-world reconnection, cross-platform bit identity, production multiplayer, real XR capture, human game feel, fluid reversibility or VexHome UI.

## Compact rule

> Preserve verified history as an append-only causal Chronicle; let people revisit it through replay, create alternate futures through exact Worldline forks, retain only materially justified motion under explicit privacy/consent, and keep renderer spectacle, model inference and external effects separate from canonical world truth.

<!-- [VEXWORLD][CHRONICLE][WORLDLINES][VXG RealForever] -->
