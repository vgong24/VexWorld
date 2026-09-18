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

### Stage 07A execution-kernel binding

Stage 07A does not treat the epoch declaration or a caller-supplied JavaScript function object as proof of the reducer that actually executes.

The public kernel boundary is a canonical descriptor:

```text
ExecutionKernel {
  kernelRef
  reducerSource
  bindings
  kernelSha256
}
```

where `kernelSha256` binds the canonical tuple:

```text
kernelRef
reducerSource
bindings
```

`replayWorldline(...)` reconstructs execution from the exact admitted `reducerSource`, revalidates the descriptor digest, and requires:

```text
executionKernel.kernelRef == epoch.kernelRef
executionKernel.kernelSha256 == epoch.kernelSha256
```

before any reducer invocation.

Caller lexical closures therefore do not cross the replay boundary. `Function#bind` / native-code source forms are not admitted. Behavior-affecting configuration that is intended to vary belongs in the explicit canonical `bindings` object, so changing that state changes the kernel identity.

For Stage 07A, each replay frame executes in a **fresh isolated Node `vm` context**. Only canonical JSON strings for state, frame, epoch and explicit bindings cross into that context. No caller object, function, prototype or mutable VM-global object is reused between frames.

The isolated context disables string/wasm code generation and removes or disables ambient time/random/network-style surfaces used by this proof. In particular:

```text
Function/eval-style dynamic code generation
Date
Math.random
process / require / module
fetch / performance / crypto
timer / microtask scheduler globals
shared-memory / weak-finalization surfaces
```

are not available as ambient reducer inputs in the Stage-07A execution mechanism.

This closes the reviewed `Object.constructor.constructor` recovery path because dynamic string compilation inside the isolated context is disabled, and a changed host global is not visible through the canonical JSON-only ingress.

The context is intentionally recreated per frame so a reducer cannot smuggle hidden mutable state from one tick to the next through VM globals.

V8 Error-stack metadata is also normalized inside the isolated realm before reducer execution:

```text
Error.stackTraceLimit = 0
Error.prepareStackTrace = deterministic context-local formatter
```

Both properties are locked non-writable / non-configurable for the reducer invocation. Canonical reducer output therefore cannot depend on host caller-frame names, host source locations, or a host-process `Error.prepareStackTrace` hook. Reducer attempts to replace the formatter or increase the stack limit fail closed.

This Error policy is part of the exact Stage-07A replay determinism boundary because `Error.stack` is an otherwise observable string that can enter canonical state. It is not generalized into a security claim about all V8 metadata surfaces.

This mechanism is a **determinism boundary for the Stage-07A proof**, not a general JavaScript security sandbox. It does not establish that `node:vm` is safe for arbitrary hostile code, and it does not authenticate arbitrary imported modules, native code, generated dependency graphs or an entire runtime image.

Successful replay receipts bind `executedKernelRef` and `executedKernelSha256` alongside the determinism epoch.

A production runtime whose reducer semantics depend on imported modules, native code, generated code or external artifacts must bind the appropriate qualified artifact/content closure before this identity can be generalized.

```text
CALLER_FUNCTION_OBJECT != EXECUTION_KERNEL_IDENTITY
REDUCER_SOURCE_TEXT_ALONE != BEHAVIOR_IDENTITY
REDUCER_SOURCE_PLUS_EXPLICIT_BINDINGS = STAGE_07A_KERNEL_DESCRIPTOR

DECLARED_EPOCH != PROOF_OF_ARBITRARY_EXECUTED_CODE
STAGE_07A_KERNEL_DESCRIPTOR != WHOLE_DEPENDENCY_CLOSURE
```

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

The verifier preserves the same contract as formation: exact fields/domains, derived event coordinate/time, payload privacy boundary, hidden-reasoning rejection, and exact Chronicle epoch binding are revalidated even when an altered object has been consistently rehashed.

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
Chronicle event count
Chronicle event head
canonical state
canonical state hash
snapshot hash
```

A snapshot consumed for fork/replay is revalidated against its source Chronicle tuple:

```text
timeline
branch
current Chronicle tick
current event count
current event head
exact epoch
world-package fingerprint
```

The minimum Stage-07A replay proof is:

```text
same epoch
+ same authenticated reducer-source identity
+ verified source Chronicle ancestry
+ same snapshot
+ same contiguous ordered input frames
= same final canonical state hash
```

Historical replay consumes the recorded accepted intent stream. It does not ask a human, controller or model to choose again.

## Intelligence provenance

A bounded intelligence decision may record:

```text
decisionRef
participantRef
workerRef
source observation ref/hash
visible context refs
controller ref
controllerDisposition
fallbackReasonOrNull
model ref/digest when used
final bounded proposed intent
accepted intent or explicit rejection
bounded concise outward-facing reason
decision hash
```

### Stage 07B observation identity

For the first worker integration, `sourceObservationSha256` is the canonical SHA-256 of the **exact observation object received by that worker cycle**.

That object currently includes fields such as the observation ref/sequence, `formedAt`, simulation time, world/reality coordinates, observer-relative bodies/resources, nearby enemies, restoration point, quest projection, affordances and unknown refs.

Therefore:

```text
SOURCE_OBSERVATION_SHA256
=
EXACT_RECEIVED_OBSERVATION_PAYLOAD_IDENTITY

SOURCE_OBSERVATION_SHA256
!=
SEMANTIC_EQUIVALENCE_CLASS
```

Changing any canonical field changes the decision content hash even when `observationRef` is unchanged.

Worker-generated `decisionRef` coordinates are separately namespaced by a canonical hash of:

```text
sessionRef
participantRef
accepted intent ref
accepted intent sequence
```

so two sessions do not collide merely because the same companion reaches the same local intent sequence.

```text
DECISION_REF = STABLE CAUSAL COORDINATE
DECISION_SHA256 = EXACT DECISION CONTENT IDENTITY
```

The worker does not claim a digest for hidden model context, private Home context, server bytes it did not receive, or subjective awareness.

### Proposal, fallback and accepted intent

The existing worker authority boundary remains intact:

```text
MODEL / DETERMINISTIC CONTROLLER
→ bounded proposal validation
→ deterministic fallback when required
→ locally formed decision evidence
→ existing accepted-intent relay
→ later Chronicle/event integration
```

For a successful Ollama decision, the bounded validated model proposal becomes the decision's `proposedIntent`.

When the model/controller path fails validation, times out or is unavailable, Stage 07B records:

```text
controllerDisposition=DETERMINISTIC_FALLBACK
fallbackReasonOrNull=<bounded error code>
proposedIntent=<final bounded deterministic fallback proposal>
acceptedIntentOrNull=<intent actually relayed>
```

The raw invalid/unbounded model output is **not** admitted into Chronicle decision evidence. This preserves the hidden-reasoning/private-context boundary and avoids treating rejected untrusted output as durable world truth.

A resolved Chronicle decision has exactly one outcome:

```text
ACCEPTED
  acceptedIntentOrNull=<accepted intent>
  rejectionReasonOrNull=null

or

REJECTED
  acceptedIntentOrNull=null
  rejectionReasonOrNull=<bounded reason ref>
```

Both accepted+rejected and neither accepted nor rejected fail the decision contract.

Likewise:

```text
controllerDisposition=DETERMINISTIC_FALLBACK
↔
fallbackReasonOrNull is present
```

so fallback provenance cannot silently disappear or be attached to an ordinary-success disposition.

Proposal and acceptance therefore remain distinct facts.

### Result-local integration boundary

Stage 07B forms decision evidence in the remote worker and returns it alongside the existing accepted intent.

It does **not** add a SessionStore decision collection, Chronicle persistence endpoint, server route, browser projection or live-world reconnection.

Decision formation is pure and is completed before the existing intent PUT. The decision is returned only when that relay succeeds.

```text
LOCAL DECISION FORMATION
!=
DURABLE CHRONICLE PERSISTENCE
```

Historical replay continues to consume recorded accepted input frames and makes no model/controller call.

A fresh inference made from an old observation belongs to a new Worldline. It cannot replace the original historical choice.

Where Chronicle events later bind the decision, the causal payload should retain both coordinates and exact content identities:

```text
OBSERVATION_DELIVERED {
  observationRef
  observationSha256
}

→ decision {
     decisionRef
     decisionSha256
     sourceObservationRef
     sourceObservationSha256
   }

→ INTENT_ACCEPTED {
     intentRef
     decisionRef
     decisionSha256
     sourceObservationRef
     sourceObservationSha256
   }
```

This keeps a later event from ambiguously referring only to a reusable coordinate if decision bytes differ.

It still does not claim:

```text
OBSERVATION_DELIVERED
=
SUBJECTIVE_AWARENESS
```

The decision contract must not contain hidden chain-of-thought, private reasoning traces, hidden prompts, credentials, private Home context or unbounded model context.

```text
MODEL_PROPOSAL != ACCEPTED_WORLD_INTENT
RECORDED_INTENT != CHAIN_OF_THOUGHT
REPLAY != MODEL_REINFERENCE
MODEL_TRAINING != WORLD_EVENT_PROVENANCE
```

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

Verifier paths preserve those same formation boundaries: live tails remain `EPHEMERAL_HOT_TAIL`, quantized samples are revalidated after readback, and shared/public promoted windows still require explicit consent even if altered bytes are consistently rehashed.

### Stage 07C synthetic capture qualification

Stage 07C does **not** open a hardware sensor stream. It adds a pure-data qualification
contract that future real capture would have to satisfy before its motion could be
represented as source-qualified Chronicle evidence.

A synthetic capture-source descriptor binds:

```text
captureMode = SYNTHETIC_FIXTURE_ONLY
captureSourceRef
participantRef
sourceClassRef
coordinateSpaceRef

deviceClockDomainRef
clockAlignmentRef
clockAlignmentDomainRef

calibrationRef
calibrationCoordinateSpaceRef

transportProfileRef
privacyClass = PARTICIPANT_PRIVATE
retentionClass = EPHEMERAL_HOT_TAIL

captureSourceSha256
```

The descriptor fails closed when its clock-alignment domain does not match its declared
device-clock domain or its calibration coordinate space does not match its declared
motion coordinate space.

Qualified synthetic capture also begins `PARTICIPANT_PRIVATE`. Sharing is not a live-tail
capture mode; it is a later explicit promoted-window decision that requires consent.

Those refs prove only that the synthetic fixture carries explicit alignment/calibration
evidence coordinates. They do **not** prove that a real headset, controller or tracker
was actually calibrated or time-synchronized.

Qualified samples add:

```text
captureSource
sourceTimeMicroseconds
transportQuality =
  DIRECT_OBSERVED
  | INTERPOLATED_ESTIMATE
  | GAP_MARKER

poseOrNull
materialityRefs[]
```

Transport quality is world-visible evidence:

```text
DIRECT_OBSERVED
  pose required

INTERPOLATED_ESTIMATE
  pose required
  pose is explicitly not represented as direct physical observation

GAP_MARKER
  pose must be null
  missing transport cannot be silently fabricated as an exact pose
```

For each capture source that remains inside the bounded hot tail,
`sourceTimeMicroseconds` must increase strictly. This is a **retained-tail**
monotonicity statement only; once old samples expire, Stage 07C does not claim to
possess or reconstruct a complete device-clock history.

A qualified sample embeds the exact synthetic capture-source descriptor, so a promoted
window retains the capture qualification that applied to the selected material
interval.

### Stage 07C material promotion / consent

Promotion continues to select only currently retained samples inside an exact
`fromTick..toTick` interval and binds:

```text
reasonRef
eventRefs[]
privacyClass
retentionClass
consentRefOrNull
```

Material event refs may bind actual formed Chronicle events such as:

```text
HIT_RESOLVED
ENVIRONMENT_FRACTURED
MOTION_WINDOW_PROMOTED
```

without converting unrelated session motion into durable history.

```text
PARTICIPANT_PRIVATE
  may be promoted without a shared-consent ref

PARTY_SHARED / PUBLIC_WORLD
  require explicit consent evidence
```

Removing shared/public consent and consistently rehashing the object still fails
verification.

Promoted windows are immutable content-addressed evidence: later hot-tail expiry does
not rewrite an already promoted exact window.

### Real capture remains a later protected effect

Real capture must still separately qualify actual device identity, clock accuracy,
calibration procedure, transport loss behavior, encryption/local storage, participant
visibility, consent lifecycle and retention policy.

Stage 07C synthetic work does not access or authorize:

```text
camera
microphone
headset/controller device
body tracker
OS sensor
real-user motion stream
background sensing
biometric classification
physical actuation
```

```text
REAL_DEVICE_CAPTURE != SYNTHETIC_CAPTURE_CONTRACT
HOT_TAIL != SESSION_ARCHIVE
GAZE_OR_POSE != PUBLIC_HISTORY
MOTION_CAPTURE != BIOMETRIC_CLASSIFICATION
MOTION_STREAM != IDENTITY_OR_WORTH
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

## Stage 07D — verified/predicted heads and local authoritative resync

Stage 07D establishes the **local deterministic protocol semantics** required before
any production multiplayer transport is considered.

```text
VERIFIED_HEAD
  accepted canonical coordinate

PREDICTED_HEAD
  local speculative continuation from one exact VERIFIED_HEAD
```

Permanent:

```text
VERIFIED_HEAD != PREDICTED_HEAD
ROLLBACK != DELETE_OR_REWRITE_VERIFIED_HISTORY
RESYNC != DISTRIBUTED_CONSENSUS
LOCAL_SYNTHETIC_ROLLBACK != PRODUCTION_NETWORKING
```

### Verified head

A verified head binds the minimum accepted coordinate already owned by Chronicle /
SessionStore:

```text
sessionRef
stateVersion

timelineRef
branchRef
tick
eventHeadSha256

canonicalStateSha256

determinismEpochRef
determinismEpochSha256
worldPackageFingerprint

sourceSnapshotRef
sourceSnapshotSha256
```

`verifiedHeadSha256` authenticates that coordinate.

The Chronicle verifier can reconnect the head to its exact source Chronicle +
snapshot. SessionStore `stateVersion` is supplied from the accepted checkpoint
record; Chronicle does not invent SessionStore authority.

### Predicted head

A predicted head:

```text
binds exactly one VERIFIED_HEAD
uses a distinct speculative branchRef
binds exact ordered predicted frame hashes
binds branch-independent input-semantic hashes
binds deterministic replay receipt / predicted final state hash

authorityClass=LOCAL_SPECULATION_ONLY
```

Prediction is pure local computation.

```text
PREDICTED_HEAD != ACCEPTED_CHECKPOINT
```

Creating or verifying a predicted head does not write SessionStore and does not
advance `stateVersion`.

### Branch-bound frame identity vs input semantics

A predicted frame and later authoritative frame intentionally have different
`branchRef` values, therefore different `inputFrameSha256` values.

07D separately computes:

```text
worldInputSemanticSha256(frame)
```

over:

```text
tick
humanActionIntents
companionIntents
scheduledWorldEvents
motionWindowRefs
rngStateByStream
```

excluding only `branchRef`.

This allows the protocol to ask:

> Did authoritative input mean the same thing as the prediction?

without pretending the speculative frame itself was already verified history.

### Match / divergence / rollback

```text
same verified parent
+ same semantic ordered inputs
→ MATCHED_AUTHORITATIVE_INPUTS

same verified parent
+ different semantic input
→ DIVERGENT_AUTHORITATIVE_INPUTS
```

Both cases replay from the **verified snapshot** on the verified branch.

For a match, the authoritative replay must reproduce the predicted state hash.

For divergence, the speculative result is discarded and authoritative frames are
replayed deterministically.

The rollback receipt binds:

```text
verified parent head
discarded prediction
authoritative input frame hashes
authoritative semantic input hashes
first mismatch index
reconciled final state hash
authoritative replay receipt
verified parent event head
verifiedParentPreserved=true
```

Rollback never edits or deletes the verified parent Chronicle.

Receipt verification can reconnect the receipt to the exact predicted head,
authoritative input frames and authoritative replay. A consistently rehashed receipt
cannot relabel divergent input as a matched prediction.

### Local authoritative resync

A local resync receipt may be formed only after the existing authoritative persistence
path has accepted the reconciled checkpoint.

The existing SessionStore remains the authority owner:

```text
ONE_ACTIVE_AUTHORITATIVE_HOST_LEASE
+
exact expected stateVersion
+
accepted writeCheckpoint(...)
=
one accepted stateVersion advance
```

The 07D integration proof requires:

```text
prediction computation
  does not mutate SessionStore

foreign host write
  -> VALID_HOST_LEASE_REQUIRED

stale expected version
  -> VERSION_CONFLICT

current lease holder + exact version
  -> accepted once
  -> stateVersion increments exactly one

released/lost lease write
  -> VALID_HOST_LEASE_REQUIRED
```

Only after the successful accepted write does the proof form an
`AUTHORITATIVE_RESYNC` receipt binding:

```text
source VERIFIED_HEAD
rollback receipt
host id
host lease generation
expected stateVersion
accepted stateVersion
accepted checkpoint hash
reconciled state hash
```

The pure Chronicle resync receipt is **not independently a lease grant** and is not a
distributed-consensus certificate. Its authority claim is justified by composing it
with the accepted SessionStore write evidence.

### Headless host continuity

07D reuses the accepted HeadlessRealmHost boundary:

```text
accepted checkpoint required
one host lease required
World Package identity checked
stateVersion drift fails closed
lease loss fails closed
fixed-step canonical simulation
HUMAN_ABSENCE != FABRICATED_HUMAN_INPUT
```

No second authoritative host or rollback-specific world-state store is introduced.

### No production transport

07D does not add or authorize:

```text
WebSocket / UDP / TCP multiplayer transport
public matchmaking
distributed consensus
production authentication
internet service discovery
remote device control
```

Existing prototype/local communication code remains existing infrastructure; this
stage does not widen it into production networking.

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
test/foundation-process.test.mjs
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
rehash-resistant event contract + exact epoch binding
snapshot integrity + source-Chronicle ancestry
execution-kernel descriptor binds reconstructed reducer source + explicit bindings
caller closure objects and native/bound-function state are excluded from replay admission
fresh per-frame isolated VM execution with canonical JSON-only ingress
dynamic constructor/global recovery rejection before canonical state can change
same descriptor + same input remains independent of changed host ambient values
wall-clock and hidden-random ambient surfaces fail closed
Error.stack is independent of host callsites and host Error.prepareStackTrace
reducer attempts to replace the deterministic Error stack policy fail closed
mismatched execution-kernel rejection before reducer execution
recorded-input replay equality
executed kernel identity in replay receipts
zero model reinference in the replay fixture
fork ancestry and parent immutability
bounded motion tail eviction
rehash-resistant motion sample validation
consent-bound window promotion + verification
fight + environment fracture chronology
hidden-reasoning rejection
```

Passing this proof establishes the bounded Stage-07A replay determinism contract. It does not prove a general JavaScript security sandbox, live-world reconnection, cross-platform bit identity, whole-module/dependency-closure authentication, arbitrary future runtime equivalence, production multiplayer, real XR capture, human game feel, fluid reversibility or VexHome UI.

## Compact rule

> Preserve verified history as an append-only causal Chronicle; let people revisit it through replay, create alternate futures through exact Worldline forks, retain only materially justified motion under explicit privacy/consent, bind reducer source plus explicit behavior bindings to the declared determinism epoch, execute the Stage-07A proof through a fresh canonical-input-only isolated context, and keep renderer spectacle, model inference and external effects separate from canonical world truth.

<!-- [VEXWORLD][CHRONICLE][WORLDLINES][VXG RealForever] -->