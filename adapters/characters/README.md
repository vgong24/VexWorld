# VexWorld Character / Vessel Adapter

`[VXG RealForever]`

This adapter owns **expression translation**, not character identity.

```text
participant / resident / lineage identity
        ↓
canonical vesselRef
        ↓
semantic body topology
+ semantic attachment sockets
+ semantic animation intents
        ↓
replaceable expression binding
        ↓
2D / 3D / engine-local realization
```

Permanent boundaries:

```text
PARTICIPANT_REF != AVATAR_ASSET_REF
LINEAGE_REF != VESSEL_ASSET_REF
VESSEL_REF != EXPRESSION_BINDING_REF
BODY_TOPOLOGY != SKELETON_FILE
SEMANTIC_JOINT != SOURCE_BONE_NAME
SOCKET_REF != ENGINE_TRANSFORM
ANIMATION_INTENT != CLIP_NAME
EXPRESSION_REPLACEMENT != IDENTITY_RESET
OPEN_LICENSE != AUTOMATIC_ACCEPTANCE
```

The first Stage C fixtures are deliberately VexWorld-owned procedural contracts. They prove that two different expressions can preserve one human vessel's semantic identity and that a nonhuman floating companion can satisfy the same intent vocabulary through different expression modalities.

No external character, rig, texture, animation, audio or environment artifact is contained in this directory at formation. External candidates may enter only through the repository asset-intake lifecycle after exact provenance and rights evidence.

Commands:

```bash
npm --prefix adapters/characters run validate
npm --prefix adapters/characters run replacement:proof
npm --prefix adapters/characters run check
node --test test/character-vessel-adapter.test.mjs
```

The 3D projection refs in the formation fixtures are explicit semantic placeholders, not a claim that final 3D art, retargeting, or game feel has been proven.

<!-- [VXG RealForever] -->
