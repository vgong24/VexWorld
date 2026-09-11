# Engine and Asset Adapter Strategy

`[VXG RealForever]`

**Architecture ref:** `architecture.vexworld.engine-and-asset-adapters/v1`  
**Candidate registry:** [`config/technology-candidates.json`](../../config/technology-candidates.json)  
**Asset policy:** [`config/asset-intake-policy.json`](../../config/asset-intake-policy.json)

## Decision

VexWorld should use strong open-source engines and reusable assets without allowing any engine scene graph, third-party character pack, renderer, or physics library to become the canonical meaning of the universe.

```text
VEXTREME / VEXWORLD SEMANTICS
  identity, relationships, world laws, actions, practices,
  abilities, items, scenarios, provenance and permissions

        ↓ deterministic World Package

ENGINE ADAPTER
  imports world meaning into one runtime

        ↓

RUNTIME / RENDERER / PHYSICS / ASSET EXPRESSION
  Godot first; later adapters remain possible
```

Permanent boundaries:

```text
WORLD_REF != SCENE_PATH
ENTITY_REF != NODE_PATH
ACTION_REF != INPUT_EVENT
ABILITY_REF != ANIMATION_CLIP
CHARACTER_REF != MESH_OR_SPRITE
VESSEL_REF != SKELETON_FILE
COLLISION_BODY != ACTOR_IDENTITY
PHYSICS_BACKEND != WORLD_LAW_OWNER
ENGINE_SAVE != PARTICIPANT_HOME_STATE
```

## Why preserve the browser/headless foundation

Version 1 already supplies an engine-neutral semantic package, deterministic headless behavior, scenarios, browser play, party state, companion-controller boundaries, resource stewardship and self-play receipts.

That implementation is not expected to become the final renderer. It remains useful as:

```text
behavioral oracle
contract fixture
low-cost headless test surface
AI-observation reference
cross-adapter parity target
recovery/debugging surface
```

The first full engine must consume those contracts. It should not erase them and declare its scene hierarchy the new source of truth.

## First selected full-engine proof: Godot

`Godot 4.7.2-stable` is selected for the bounded `VW-FWD-01B` proof because it provides an integrated open-source 2D/3D engine, physics, animation, input, UI, scripting and headless/server routes under the MIT license.

Selected means:

```text
worth implementing one bounded adapter proof
```

It does not mean:

```text
permanent exclusive engine
all current browser code deprecated
production platform selected forever
every Godot subsystem automatically adopted
```

### Godot adapter responsibilities

```text
read one compiled World Package
validate package generation and supported contract versions
resolve semantic zones/entities/actions into engine-local instances
bind expression assets through explicit adapter records
emit engine-local runtime identifiers separately from canonical refs
translate input into semantic ActionIntent
return authoritative WorldActionReceipt / state delta
support headless deterministic fixture execution where possible
expose unsupported and approximated semantics rather than guessing
```

Candidate layout:

```text
adapters/godot/
  README.md
  adapter.manifest.json
  toolchain.lock.json
  project.godot
  addons/vexworld_adapter/
  src/
    package_loader/
    semantic_registry/
    realm_bridge/
    action_bridge/
    expression_bridge/
    observation_bridge/
  fixtures/
  tests/
```

Do not commit engine binaries. Bootstrap exact toolchain versions separately and record hashes/source.

## Physics candidates

### Built-in Godot physics — first path

Use the selected engine's normal 2D physics for the first Grove adapter unless evidence shows a missing requirement. Keep physical parameters and gameplay meaning in VexWorld contracts where portability matters.

### Rapier

Rapier is a Rust 2D/3D physics library under Apache-2.0. It is a good candidate for an independent simulation, Rust/WASM, or cross-runtime physics adapter if later requirements justify a second backend.

Do not add it merely because it is capable. A second physics implementation creates parity, determinism, build, and maintenance obligations.

### Box2D

Box2D is a mature MIT-licensed 2D physics library and a useful specialist reference or alternative backend. It may become relevant if First Grove needs a small dedicated 2D physical model outside a full engine.

### Jolt Physics

Jolt is an MIT-licensed high-performance 3D physics candidate. It belongs to later 3D/world-scale investigation, not the current 2D proof.

```text
MULTIPLE AVAILABLE BACKENDS
!=
MULTIPLE BACKENDS SHOULD BE ADOPTED NOW
```

## Other rendering/runtime candidates

### Bevy

Bevy is a data-driven Rust game engine dual-licensed MIT/Apache-2.0. It may eventually provide a useful data-oriented or independent runtime proof. Its own project material identifies the engine as early-stage and expects frequent breaking changes, so it remains held until VexWorld has a reason to pay that integration cost.

### Babylon.js

Babylon.js is an Apache-2.0 browser 3D engine. It could become a later web-based 3D expression adapter while preserving the current local/browser accessibility route. It is not needed before the Godot/world-package boundary is proven.

## Interchange and authoring

### glTF 2.0

Use glTF 2.0 as the initial portable 3D asset exchange baseline for meshes, materials, skeletons and animation clips.

A glTF file does not carry complete VexWorld meaning. Pair it with sidecars for:

```text
characterRef / vesselRef
bodyTopologyProfileRef
semanticJointMapRef
attachmentSocketMapRef
animationIntentBindings[]
materialSlotBindings[]
collisionAndInteractionProfileRef
expressionAndAccessibilityMetadata
source/license/provenance
known losses and unsupported features
```

### VRM

VRM may be considered as an optional humanoid-avatar projection over glTF. It must not make humanoid bodies universal, assign capability from body type, or exclude nonhuman companion vessels.

### Blender

Blender is the selected open authoring-tool class for original VexWorld meshes, rigs, animation and procedural asset creation. Blender's program license and the rights to creator-authored output are separate records. Repeatable export profiles should be checked in as source rather than relying on one person's hidden editor state.

## Open asset use: reference, adapter proof and replaceability

VexWorld may use compatible open assets in three deliberately distinct ways:

```text
STRUCTURAL_REFERENCE
  inspect topology, rig, sockets, animation coverage or environment-kit composition

PROTOTYPE_EXPRESSION
  render a temporary licensed body/environment while gameplay and adapter seams are tested

ACCEPTED_WORLD_EXPRESSION
  intentionally ship an exact asset under its recorded rights and attribution conditions
```

None of these classes makes the asset canonical character identity.

Candidate sources currently held for exact intake include:

```text
Kenney CC0 packs
Quaternius Universal Base Characters
Quaternius Cute Animated Monsters
KayKit Adventurers
KayKit Forest
MakeHuman exact core/community assets after asset-specific rights review
```

No candidate is currently downloaded or accepted by this architecture alone.

## Character rebuilding without proprietary copying

The requested goal is not to ingest a proprietary character and mechanically disguise it. The legitimate route is:

```text
generic functional question
  What body topology, rig semantics, sockets, animation intents,
  proportions and interaction affordances are needed?

→ inspect lawful/open references and standards
→ extract non-expressive adapter requirements
→ define VexWorld semantic body contracts
→ author original VexWorld expression
→ prove a third-party reference can be replaced
```

Allowed learning targets include:

```text
bone hierarchy categories
root-motion and locomotion needs
attachment sockets
modular garment/body seams
animation state coverage
collision volumes
LOD/export constraints
material slot structure
accessibility/readability needs
```

Do not copy:

```text
distinctive character silhouette
costume design
face/hair combination
texture or palette identity
signature animation performance
proprietary names/lore
ripped mesh, rig, code, map, sound or music
```

`STRUCTURE_ANALYZED` is not a license to reproduce expressive authorship.

## Asset-intake lifecycle

```text
RESEARCHED_NOT_DOWNLOADED
→ QUARANTINED_EXACT_ARTIFACT
→ LICENSE_AND_RIGHTS_REVIEWED
→ STRUCTURE_ANALYZED
→ SEMANTIC_ADAPTER_MAPPED
→ REPLACEMENT_TEST_PASSED
→ ACCEPTED_REFERENCE_STRUCTURE_ONLY | ACCEPTED_EXPRESSION_INPUT
→ later retain, replace or supersede
```

Every exact intake records:

```text
official source
publisher
version/release
retrieval date
artifact SHA-256
license identity and source
permitted-use summary
attribution requirement
modification history
intended role
local repository path
review and disposition
```

Unknown or conflicting rights fail closed.

## Replacement proof

Before architecture depends on an external character or environment pack, prove:

```text
reference asset A
→ semantic adapter
→ gameplay/world behavior

original or separately licensed asset B
→ same semantic adapter contract
→ same canonical character/world behavior
```

Visual differences are expected. Canonical identity, capability, inventory, relationship, action intent and world law should survive.

This is the practical test that VexWorld is mapping assets into its universe rather than mapping its universe into one asset pack.

## Adapter parity

Every new engine/runtime adapter should classify each contract as:

```text
NATIVE
TRANSFORMED_EQUIVALENT
APPROXIMATED_WITH_DECLARED_LOSS
PRESENT_BUT_INACTIVE
UNSUPPORTED
UNKNOWN_BLOCKED
```

Parity evidence should cover at least:

```text
world/package loading
entity identity
movement and collision
semantic actions
resource/restoration state
observer-relative AI packets
party and companion-controller separation
save/checkpoint boundaries
status/reality orientation
safe exit/return
```

Exact pixel equality is not required. Semantic equality or declared transformation is.

## Adoption gate

A technology or asset becomes adopted only after:

```text
exact source/version/license known
bounded adapter implemented
scenario and contract evidence passing
security and dependency implications reviewed
cross-platform setup path understood
replacement/rollback path retained
fresh exact-head review accepted
project state and source map updated
```

A GitHub star count, popularity, demo, model recommendation, or attractive asset preview is not adoption evidence.

## Compact rule

> Use open engines to realize worlds, open formats to move expressions, and lawful open assets to teach adapters—but let VexWorld retain the identity, relationships, laws, actions and history. Learn structural possibilities without copying proprietary expression, prove every dependency replaceable at the semantic boundary, and adopt only what earns its maintenance burden through a bounded working proof.

<!-- [VXG RealForever] -->
