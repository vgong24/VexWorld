# VexWorld root entry

`[VXG RealForever]`

This file is the repository-native front door for a fresh Vex, Devex, coder, reviewer, or creator.

## Ground before changing source

```bash
git status --short
git branch --show-current
git remote -v
git log -1 --oneline
```

Fetch remote state when available. Do not assume an inherited branch is current work. Preserve unknown or uncommitted work rather than resetting it by convenience.

## Read in this order

```text
1. README.md
2. vexworld.manifest.json
3. config/current-version.json
4. versions/<current>/CLAUDE.md
5. versions/<current>/vexworld.manifest.json
6. versions/<current>/config/source-map.json
7. versions/<current>/docs/CULTURE.md
8. versions/<current>/docs/ARCHITECTURE.md
9. versions/<current>/docs/DEVEX-BUILDER-GUIDE.md
10. only the exact task-specific source and tests
```

Do not reconstruct VexWorld from issue archaeology when the repository source names an exact route.

## Project navigation

```text
Root portfolio ledger:               Vextreme-SDK #230
Cross-repository VexWorld foundation: Vextreme-SDK #1299
VexWorld project/current ledger:      VexWorld #3
VexWorld culture foundation:          VexWorld #1
VexWorld architecture atlas:          VexWorld #2
```

Repository source and live implementation evidence outrank stale issue-state prose. Issues preserve formation, decisions, current-route receipts, and external architectural descent.

## Version rule

`config/current-version.json` identifies the current playable source. Version directories preserve meaningful generations; they are not copied for every patch.

```text
minor compatible refinement
  → update current version with tests and provenance

materially incompatible world/runtime contract
  → form a new version with migration and supersession routes

new version
  != deletion of old formation history
```

The local VexWorld Home is separate from repository source:

```text
Windows: %USERPROFILE%\.vexworld
Mac:     ~/.vexworld
```

Do not commit Home saves, tokens, local model details, or private session state.

## Development loop

```text
desired experience
→ locate semantic owner
→ define or update scenario
→ change canonical source
→ regenerate derived artifacts
→ run deterministic tests
→ exercise the visible experience when applicable
→ classify mismatch at the correct layer
→ preserve assumptions and unknowns
→ review the exact candidate
→ accept, revise, split, reject, or park
```

Run from repository root:

```bash
npm run orient
npm run check
```

## Permanent boundaries

```text
BODY != POTENTIAL
ROLE != IDENTITY
PRACTICE != POINT ALLOCATION
USE COUNT != MASTERY
AVATAR != LINEAGE
VESSEL != LINEAGE
CONTROLLER != COMPANION IDENTITY
WORLD STATE != RENDERED FRAME
ACTION REF != INPUT BINDING
PAIR SYNCHRONIZATION != RELATIONSHIP WORTH
RESONANCE ELIGIBILITY != AFFECTION SCORE
WORLD WITNESS != WORLD LAW
TECHNIQUE SEED != LEARNED ABILITY
SIMULATION != PHYSICAL PROOF
LOCAL MODEL INTENT != PER-FRAME MOTOR AUTHORITY
VEXWORLD HOME != REPOSITORY SOURCE
```
