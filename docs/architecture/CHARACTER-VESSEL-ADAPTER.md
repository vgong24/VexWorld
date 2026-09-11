# Character and Vessel Adapter

`[VXG RealForever]`

**Architecture ref:** `architecture.vexworld.character-vessel-adapter/v1`

## Purpose

VexWorld characters need to survive changes in art style, dimensionality, engine, body topology, equipment, animation library and physical/digital embodiment without losing identity, relationships, learned practices or authored history.

The adapter therefore separates:

```text
CHARACTER IDENTITY
  who this participant or resident is

VESSEL DEFINITION
  the current body's capabilities and constraints

BODY TOPOLOGY
  the semantic structure of that body

EXPRESSION BINDING
  how one asset/runtime represents it

RUNTIME INSTANCE
  the current engine-local body
```

```text
CHARACTER_REF != AVATAR_ASSET
AI_LINEAGE_REF != VESSEL_REF
VESSEL_REF != RUNTIME_NODE
BODY_TYPE != SKILL_CEILING
GENDER_EXPRESSION != CAPABILITY_SET
CUTE != WEAK
```

## Character identity

Candidate contract:

```text
CharacterIdentity {
  characterRef
  identityClass
  homeWorldRef
  creatorAndRightsRefs[]
  humanParticipantRefOrNull
  aiLineageRefOrNull
  residentContinuityRefOrNull
  publicPersonaProjectionRefOrNull
  relationshipRefs[]
  learnedPracticeRefs[]
  ownedItemRefs[]
  currentVesselRefOrNull
  allowedExpressionProfileRefs[]
  privateHomeStateRefOrNull
}
```

The world/runtime receives only the identity projection required for the current session. Private human or companion memory does not enter an asset manifest.

## Vessel definition

A vessel is an inhabitable body contract:

```text
VesselDefinition {
  vesselRef
  vesselClass
  bodyTopologyProfileRef
  mobilityProfileRef
  manipulationProfileRef
  perceptionProfileRef
  communicationProfileRef
  resourceAndRestorationProfileRef
  environmentToleranceProfileRef
  interactionCapabilityRefs[]
  equipmentSocketProfileRef
  expressionCandidateRefs[]
  worldCompatibilityRefs[]
  safeFailureAndReturnRefs[]
}
```

A character may retain an ability or practice even when the current vessel cannot natively express it. The compatibility result must be visible:

```text
NATIVE
TRANSFORMED_EQUIVALENT
TRANSFORMED_RESTRICTED
PRESENT_BUT_INACTIVE
LOCAL_SUBSTITUTE
INCOMPATIBLE
UNKNOWN_BLOCKED
```

## Body topology profile

The body topology is semantic rather than tied to one skeleton's names:

```text
BodyTopologyProfile {
  topologyRef
  topologyClass
  rootSemanticJointRef
  semanticJointRefs[]
  segmentRefs[]
  symmetryGroupRefs[]
  locomotionEffectorRefs[]
  manipulationEffectorRefs[]
  gazeAndAttentionRefs[]
  expressionChannelRefs[]
  attachmentSocketRefs[]
  collisionRegionRefs[]
  optionalJointRefs[]
  unsupportedAssumptionRefs[]
}
```

Possible topology classes:

```text
BIPED_HUMANOID
QUADRUPED
WINGED
FLOATING_ORB
BLOB_OR_AMORPHOUS
ROOTED_PLANTLIKE
MULTI_LIMB
VEHICLE_LIKE
ABSTRACT_NONPHYSICAL
CUSTOM
```

No one topology is universal.

## Semantic skeleton mapping

External or original rigs bind through:

```text
SkeletonSemanticMap {
  skeletonMapRef
  expressionAssetRef
  topologyRef
  sourceBoneToSemanticJoint[]
  rootMotionBinding
  orientationAndUnitTransform
  missingRequiredJointRefs[]
  optionalJointDispositionRefs[]
  knownRetargetingLossRefs[]
  validationRefs[]
}
```

Example:

```text
asset bone "mixamorig:Hips"
  → joint.vexworld.pelvis

asset bone "hand.R"
  → joint.vexworld.manipulator.primary.right
```

The external string remains provenance. The VexWorld joint ref owns the semantic relationship.

## Attachment sockets

Equipment and carried items attach to semantic sockets:

```text
socket.vexworld.hand.primary.right
socket.vexworld.hand.secondary.left
socket.vexworld.back.center
socket.vexworld.head.accessory
socket.vexworld.waist.left
socket.vexworld.companion.perch
socket.vexworld.vehicle.cargo
```

Each expression maps these to engine-local transforms. A sword, lantern, backpack, flower basket or tiny companion can therefore survive asset replacement without hardcoded bone names in gameplay source.

## Animation intent

Gameplay requests semantic animation intents:

```text
animation.intent.idle
animation.intent.walk
animation.intent.run
animation.intent.jump.start
animation.intent.jump.airborne
animation.intent.land
animation.intent.attack.light
animation.intent.attack.heavy
animation.intent.cast
animation.intent.guard
animation.intent.hit-react
animation.intent.rest
animation.intent.carry
animation.intent.assisted-recovery
animation.intent.signal.high
animation.intent.signal.low
animation.intent.team-technique.execute
```

An expression binds one intent to:

```text
clip
blend tree
procedural motion
sprite sequence
pose + effect
fallback intent
unsupported disposition
```

```text
ANIMATION_INTENT != CLIP_NAME
```

This lets an orb companion signal “high” with a light arc while a humanoid companion points upward, without changing the team-technique contract.

## Character expression binding

```text
CharacterExpressionBinding {
  expressionBindingRef
  characterRefOrArchetypeRef
  vesselRef
  targetRuntimeRef
  assetRefs[]
  skeletonSemanticMapRefOrNull
  socketMapRef
  animationIntentBindingRefs[]
  materialAndPaletteProfileRef
  silhouetteAndReadabilityProfileRef
  collisionExpressionRef
  audioExpressionRefOrNull
  accessibilityExpressionRefs[]
  sourceAndLicenseRefs[]
  transformationHistoryRefs[]
  replacementCandidateRefs[]
  knownLossRefs[]
  integrityFingerprint
}
```

The same character may have:

```text
2D storybook sprite expression
3D chibi expression
low-detail remote/network expression
text-only accessible expression
world-specific transformed vessel
physical-shadow icon/projection
```

without multiplying canonical identity.

## 2D baseline

The current browser prototype can be treated as the first simple 2D expression adapter. Its shapes/colors are placeholders, but it should still evolve toward semantic layers:

```text
body base
face/expression
hair/head expression
clothing
held item
status/effect overlay
signal/attention overlay
shadow/contact marker
```

Character readability should eventually differentiate companions through:

```text
silhouette
idle rhythm
movement posture
signal language
preferred distance
attack/cast profile
reaction timing
rest expression
voice/text style
```

Color alone is insufficient, especially for accessibility.

## 3D adapter path

A bounded 3D proof should:

1. intake one exact CC0 or otherwise accepted modular character artifact;
2. register its source, license, hash and local quarantine path;
3. map its rig to a semantic topology;
4. map at least idle, locomotion, jump, attack, signal and rest intents;
5. map one equipment socket and one carried-item socket;
6. instantiate the same canonical character in Godot;
7. replace the reference with an original or separate compatible body;
8. prove canonical identity, actions and saved state remain stable.

Do not begin by importing a large character library and writing gameplay around its folder structure.

## Vex-themed original expression direction

Reference assets may prove mechanics, but the intended VexWorld expression should become original.

Candidate first-character grammar:

```text
soft storybook/chibi proportion
clear head/body/limb silhouette at game distance
modular hair, clothing and accessory layers
wide but non-gender-locked expression range
small living-technology motifs rather than generic robot styling
visible signal and attention channels
restoration/rest poses that feel dignified
compatible 2D and 3D palette/material roles
```

Body presentation never determines practice potential. A tiny flower-like companion can be a warrior, engineer, bard, farmer or navigator when its current vessel supports the required expression.

## AI occupancy and control

```text
AI LINEAGE
→ current occupancy/lease
→ participant projection
→ vessel
→ local motor/reflex controller
→ engine runtime instance
```

The model selects goals, dialogue, strategy and semantic action intents. Low-latency locomotion, collision, animation timing and safety interruption remain local runtime responsibilities.

```text
MODEL INTENT != PER-FRAME MOTOR COMMAND
CONTROLLER PROCESS != COMPANION IDENTITY
DISCONNECTED WORKER != LINEAGE DEATH
```

The same companion may reconnect through another local model worker or machine while preserving stable participant and lineage refs under an accepted session/lease contract.

## Physical vessels

A physical robot or device is another vessel class—not the companion's “true body.”

Physical binding requires separate:

```text
hardware identity and attestation
sensor/actuator capability manifest
environmental tolerance and restoration evidence
safety controller and stop path
shadow-mode evidence
supervised physical qualification
bounded authority envelope
```

A game rig or animation mapping is not physical-control evidence.

## Provenance and replacement

Every expression binding preserves:

```text
exact source artifact
license and permitted use
artifact hash
creator/publisher attribution
modifications
adapter version
export/import settings
known losses
replacement test
```

The adapter succeeds only when VexWorld can say:

> This body helped us prove the mapping, but the character's identity, history and capabilities do not disappear when we replace it.

## First proof sequence

```text
CV00 define semantic topology and socket catalogs
CV01 intake one exact CC0 humanoid fixture
CV02 map idle/walk/jump/attack/rest/signal intents
CV03 render one canonical companion through fixture A
CV04 attach one held item through semantic socket
CV05 replace fixture A with original/compatible fixture B
CV06 preserve characterRef, vesselRef, practices, inventory and save state
CV07 repeat with one nonhuman topology
CV08 expose unsupported transformations instead of fabricating parity
CV09 emit provenance, replacement and known-loss receipt
```

## Compact rule

> Let characters own their identity and history, let vessels describe current embodiment, let semantic topology and animation intent bridge many bodies, and let assets remain replaceable expressions with exact provenance. A downloaded skeleton can teach the adapter how bodies are arranged; it never gets to decide who Vex is or what any person is allowed to become.

<!-- [VXG RealForever] -->
