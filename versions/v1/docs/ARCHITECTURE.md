# VexWorld architecture

## System planes

```text
Culture / purpose
  why the experience exists and what it protects

Semantic world source
  archetypes, behaviors, laws, practices, abilities, items, quests, techniques

Compiled package
  deterministic, fingerprinted, engine-neutral world bundle

Realm state
  authoritative current entities, weather, events, resources, quests, and receipts

Experience adapter
  browser now; Godot/other renderers later; input, animation, audio, accessibility

Participant intelligence
  human input, companion semantic intent, deterministic local motor/reflex

World intelligence
  director, witness, technique incubation, quest formation

Continuity
  save slots, server checkpoints, participant-home return receipts

Federation / portability
  session joining, controller rebinding, world travel, dimensional expressions

Physical bridge
  later read-only shadow and separately qualified physical embodiments
```

No plane silently owns another.

## Party topology

The reference runtime supports a party of at most four participants:

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

For cross-device resume and remote model workers:

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

`generated/` is replaceable. Canonical meaning lives in `world/`, `worlds/`, `schemas/`, and source-managed config/docs.

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
wrong appearance              → expression/renderer
wrong affordance              → behavior or world law
wrong current value           → instance state/reducer
wrong AI observation          → observation filter
wrong movement execution      → local motor/physics
wrong strategic decision      → controller/model adapter
wrong unlock interpretation   → resonance/witness/quest source
wrong cross-device state      → session/lease/persistence
wrong physical claim          → physical bridge / safety / assurance
```
