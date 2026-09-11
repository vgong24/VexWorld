# Godot adapter architecture — VW-FWD-01B

`[VXG RealForever]`

```text
architectureRef=architecture.vexworld.godot-adapter.v0
stageRef=stage.vexworld.vw-fwd-01b
engineRef=technology.godot.4.7.2-stable
adapterRef=adapter.vexworld.godot.first-grove.v0
```

## Purpose

Godot gives Vextory a mature rendering, physics, input and authoring body without becoming the owner of VexWorld meaning.

```text
canonical Version 1 source
→ deterministic WorldCompiler
→ World Package
→ Godot adapter build
→ Godot runtime realization
```

The existing JavaScript/headless runtime remains an independent reference implementation and semantic oracle.

## Ownership boundary

```text
World Package owns:
  worldRef
  entityRef
  actionRef
  world laws
  scenario meaning
  party capacity
  reality class
  package fingerprint

Godot adapter owns:
  scene realization
  Node2D/CharacterBody2D placement
  collisions and local motor realization
  camera
  adapter-local input actions
  procedural placeholder drawing
  engine bootstrap
  engine-specific receipts
```

Permanent non-collapse:

```text
WORLD_REF != SCENE_PATH
ENTITY_REF != NODE_PATH
ACTION_REF != GODOT_ACTION != INPUT_EVENT
ABILITY_REF != ANIMATION_CLIP
PARTICIPANT_REF != CHARACTER_BODY_NODE
WORLD_LAW != ENGINE_SETTING
REALM_STATE != SCENE_TREE
```

Godot nodes carry semantic refs in metadata so runtime inspection can return to canonical meaning. Metadata is a pointer; node existence does not grant source ownership.

## Source/generated split

Authored adapter source lives under:

```text
adapters/godot/config/
adapters/godot/scenes/
adapters/godot/scripts/
adapters/godot/tools/
adapters/godot/test/
```

Generated, replaceable projections live under:

```text
adapters/godot/generated/
adapters/godot/artifacts/
adapters/godot/.runtime/
```

Those generated/runtime roots are ignored from source except placeholder `.gitkeep` files.

`tools/build-adapter.mjs` compiles the canonical Version 1 source rather than hand-authoring a competing Godot copy of First Grove.

## Engine bootstrap

The proof pins:

```text
Godot 4.7.2-stable
tag commit ed1daf0bf001b61586d9930840f2f1394092c079
MIT license
```

`tools/bootstrap-godot.mjs` queries the official release API for the exact tag, selects the exact platform artifact, requires GitHub's release-asset `sha256:` digest, verifies downloaded bytes, extracts to ignored `.runtime/`, and rejects a binary whose `--version` is not `4.7.2.stable…`.

This deliberately avoids:

```text
latest-version drift
committed engine binaries
unverified mirrors
engine availability being mistaken for adoption
```

## Semantic parity proof

Stage B does **not** try to prove complete JavaScript/Godot equivalence immediately. It chooses one meaningful deterministic slice: the rain/restoration return-margin projection.

```text
scenario.first-grove.rain-restoration
→ canonical Version 1 resource-state implementation
→ reference parity fixture
→ independent GDScript computation
→ exact values/band comparison
→ Godot parity receipt
```

The current fixture checks that rain increases predicted return cost and decreases safe margin without changing the semantic band incorrectly.

This proves one adapter seam. It does not prove all combat, movement, World Witness, networking or game-feel behavior.

## Visual smoke proof

The first scene is intentionally procedural:

```text
platforms
original simple trees/rocks
Sunbloom Hearth
Echo Gate
simple creatures
one human vessel
one deterministic companion vessel
status overlay
```

No external art pack is needed to answer the Stage B architecture question. Character/environment intake belongs to Stage C after the engine boundary is accepted.

## Status action

`config/action-bindings.json` explicitly maps semantic `actionRef` values onto adapter-local Godot action names and physical keys.

```text
action.vexworld.status.open
→ vw_status
→ Tab / I
```

The visible status panel names the World Package, fingerprint, reality class, and current vessel refs, and reminds the player that Godot nodes are replaceable adapter state.

## What success means

Stage B succeeds when a fresh reviewer can establish:

```text
exact engine provenance
cross-platform bootstrap
World Package import
procedural First Grove realization
human + companion embodiment
semantic status route
one headless semantic parity scenario
one visual smoke receipt
no external art intake
no semantic ownership leakage into Godot
```

Even then, Godot remains a proven adapter. A later institutional decision may choose it as the preferred runtime, but this stage does not make that permanent claim.
