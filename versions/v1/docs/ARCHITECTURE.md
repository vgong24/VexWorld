# VexWorld architecture

## Product identity

```text
VexWorld
  shared semantic / experiential world layer

Vextory
  native adventure-world family

Vextory: First Grove
  first playable reference realm
```

The current Version 1 runtime is game-shaped because First Grove is a playable realm. The architecture underneath is not game-only.

See the repository-level completion-state source:

```text
docs/architecture/SHARED-WORLD-COMPLETION-STATE.md
```

## Completion-state topology

VexWorld should support several depths of participation without flattening them:

```text
PUBLIC PRESENCE
EXPERIENCE SPACE
PRACTICE TWIN
REALM
FEDERATED WORLD
```

A source-owned business, institution, creator, community or external system may project into VexWorld without VexWorld taking ownership of its canonical records/effects.

```text
PROJECTION != SOURCE REALITY
PORTAL != IDENTITY RESET
FEDERATION != CENTRALIZATION
```

## System planes

```text
Culture / purpose
  why the shared world exists and what it protects

Semantic world source
  archetypes, behaviors, laws, practices, abilities, items, quests, techniques

External/source projection
  bounded meaning from independently-owned businesses, institutions, creators,
  Practice Twins, simulations or other worlds

Compiled package
  deterministic, fingerprinted, engine-neutral world bundle

Realm state
  authoritative current entities, weather, events, resources, quests, and receipts

Experience adapter
  browser now; Godot/other renderers later; input, animation, audio, accessibility

Participant intelligence
  human input, companion semantic intent, deterministic local motor/reflex

World intelligence
  director, witness, technique incubation, quest/opportunity formation

Continuity
  save slots, Chronicle/World Memory projections, participant-home return receipts

Federation / portability
  world discovery, portals, compatibility, session joining, controller rebinding,
  world travel, dimensional expressions, return routes

Physical bridge
  later read-only shadow and separately qualified physical embodiments
```

No plane silently owns another.

## Federation posture

The mature shared world should be a graph of independently-owned worlds/experiences rather than one monolithic mega-realm.

A cross-world relation must preserve, where applicable:

```text
participant identity
world/source owner
reality class
compatibility
permissions / consent
provenance
return route
history / Chronicle boundary
```

Production federation/networking is not implemented by this architecture statement.

## Party topology

The Version 1 reference runtime supports a party of at most four participants:

```text
one human + zero to three companions
```

The underlying contracts do not require that composition forever. Keep separate:

```text
participant identity
lineage identity
party membership
avatar expression
vessel instance
controller binding
model/provider session
device/host connection
realm authority
```

A companion may be controlled by a deterministic local policy, a remote model worker, or a future controller without becoming a different lineage merely because the binding changes.

## Host-authoritative LAN prototype

For cross-device resume and remote model workers in the current reference realm:

```text
one realm host lease
  owns authoritative simulation and state checkpoints

zero or more browser clients
  one active human host in this prototype; later spectators/players may be added

zero to three companion workers
  each receives observer-relative packets and returns high-level intent

local motor/reflex
  executes bounded real-time movement and cancellation
```

Two computers may run different companion workers against one host session. A second browser can resume after the first host releases or loses its lease. This is not production networking or identity security.

## Compiler boundary

```text
canonical JSON source
→ validate refs, structure, scenarios, and ownership
→ deterministic World Package
→ headless kernel
→ renderer/controller adapters
```

`generated/` is replaceable. Canonical Version 1 world meaning lives in `world/`, `worlds/`, `schemas/`, and source-managed config/docs.

External source projections must preserve their own owner/provenance rather than being silently promoted into Version 1 world source.

## Runtime rates

```text
render and physics: fixed 60 Hz simulation step
local motor/reflex: every simulation step
world events: deterministic step/event processing
remote/model semantic intent: asynchronous, low frequency
persistence: periodic checkpoint and explicit save
World Witness: event-driven after eligible evidence
```

The LLM is never required to emit per-frame movement.

## Discrepancy routing

```text
wrong product/world identity        → completion-state / culture source
wrong external ownership            → source projection / federation boundary
wrong appearance                    → expression/renderer
wrong affordance                    → behavior or world law
wrong current value                 → instance state/reducer
wrong AI observation                → observation filter
wrong movement execution            → local motor/physics
wrong strategic decision            → controller/model adapter
wrong unlock interpretation         → resonance/witness/quest source
wrong cross-device state            → session/lease/persistence
wrong cross-world compatibility     → federation / portal contract
wrong physical claim                → physical bridge / safety / assurance
```

<!-- [VXG RealForever][VEXWORLD][ARCHITECTURE] -->
