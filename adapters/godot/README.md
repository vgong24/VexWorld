# VexWorld Godot adapter — Stage B proof

`[VXG RealForever]`

This directory is a **replaceable Godot 4.7.2 realization adapter** for the engine-neutral VexWorld World Package. It is not the canonical owner of First Grove, participants, abilities, actions, laws, saves, or lineage identity.

## Build the adapter inputs

From the repository root:

```bash
npm --prefix versions/v1 run compile
npm --prefix adapters/godot run check
```

`npm --prefix adapters/godot run build` compiles canonical Version 1 source and writes replaceable files under `adapters/godot/generated/`.

## Get the pinned Godot runtime

```bash
npm --prefix adapters/godot run bootstrap
```

The bootstrap discovers the exact `4.7.2-stable` release through the official GitHub release API, selects the exact platform artifact, requires GitHub's SHA-256 asset digest, verifies the downloaded bytes, checks `godot --version`, and keeps the executable under ignored `.runtime/` storage. The binary is not committed.

Supported proof hosts:

```text
Windows x64
macOS universal
Linux x64 (CI/reference)
```

You may set `GODOT_BIN` to an already-installed executable; it is still rejected unless its reported version begins with `4.7.2.stable`.

## Headless parity proof

```bash
npm --prefix adapters/godot run godot:check
```

The reference Version 1 resource projection computes the rain/restoration fixture first. Godot independently recomputes the same semantic projection and emits a receipt. This proves one bounded semantic scenario; it does not prove complete runtime equivalence.

## Visual proof

```bash
npm --prefix adapters/godot run godot:smoke
```

The scene uses only procedural placeholder shapes. It reads the generated World Package, realizes platforms/entities, spawns a human vessel and deterministic companion, carries semantic refs in node metadata, and exposes the semantic status action. CI may wrap this command with a virtual display on Linux.

## Permanent boundary

```text
WORLD_REF != SCENE_PATH
ENTITY_REF != NODE_PATH
ACTION_REF != INPUT_EVENT
ABILITY_REF != ANIMATION
AVATAR_REF != SPRITE_OR_MESH
REALM_STATE != SCENE_TREE
```

No external character/environment asset belongs to this stage.
