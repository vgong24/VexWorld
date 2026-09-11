# Change Impact and Anomaly Protocol

`[VXG RealForever]`

**Protocol ref:** `protocol.vexworld.change-impact-and-anomaly/v1`  
**Source map:** [`config/change-impact-map.json`](../../config/change-impact-map.json)

## Purpose

A repository can remain small and still become fragile when a change silently affects setup, generated packages, headless behavior, browser play, companion control, assets, or future engine adapters. VexWorld therefore treats every changed path as a typed impact signal.

```text
changed paths
→ declared impact rules
→ capability and owner set
→ required tests and witnesses
→ anomaly checks
→ bounded review obligations
```

The map is not proof that the behavior is correct. It prevents affected areas from remaining invisible.

## Command

Classify explicit paths:

```bash
npm run impact -- --files README.md,versions/v1/browser/index.html
```

Classify a branch diff:

```bash
npm run impact -- --base <accepted-base> --head HEAD
```

Machine-readable output:

```bash
npm run impact -- --base <accepted-base> --head HEAD --format json
```

An unmapped path produces an attention disposition by default.

## What one impact rule declares

```text
ruleRef
pathPatterns[]
capabilityRefs[]
ownerRef
requiredTestRefs[]
anomalyRefs[]
```

A file may match more than one rule. That is expected when, for example, a Version 1 script affects both runtime and companion/LAN behavior.

The result should expose:

```text
changedFiles[]
matchedRuleRefs[]
capabilityRefs[]
ownerRefs[]
requiredTestRefs[]
anomalyRefs[]
unmappedFiles[]
ignoredFiles[]
disposition
```

## Unmapped path behavior

```text
UNMAPPED != HARMLESS
```

An unmapped path may mean:

1. a new capability has not been placed;
2. the map is incomplete;
3. the file is in the wrong directory;
4. a generated, temporary, vendor, cache, or secret artifact entered source unexpectedly;
5. a contributor is bypassing an owner boundary.

The builder must explain and repair the placement. Do not add a repository-wide wildcard such as `**` merely to make the check pass.

## Core anomaly families

### Entry and setup

```text
current-version pointer no longer matches repository manifest
root launcher bypasses current-version resolution
Windows and Mac setup routes diverge in meaning
VexWorld Home becomes stored inside downloaded source
unowned process or port is killed by convenience
```

### Source and generated output

```text
generated package edited directly
source changes without generated refresh
compiler output is nondeterministic
source map points to a missing or stale path
projection begins owning canonical meaning
```

### World semantics and runtime

```text
engine scene/node identity replaces semantic refs
renderer visibility determines participant existence
headless behavior diverges without declared adapter difference
world law changes without scenario coverage
replay no longer reproduces deterministic state
```

### Companion and AI

```text
model output becomes per-frame motor authority
controller/worker/model identity collapses into companion lineage
one companion receives omniscient world state
fallback behavior impersonates a real model response
World Witness candidate silently grants an ability
```

### Relationship and resonance

```text
pair synchronization becomes hidden affection or worth score
resonance gates safety, dignity, continuity or the ability to leave
private relationship memory enters public technique lineage
repeated play is treated as consent to publish a discovery
```

### Assets and adapters

```text
asset is added without exact source/license/hash
open-source engine license is misapplied to bundled assets
bone or animation names become canonical action identity
one reference asset becomes irreplaceable architecture
proprietary character expression is copied under a generic-adapter rationale
```

### Network and physical bridge

```text
trusted-LAN development route becomes public service by configuration drift
server token is represented as production authentication
simulation success becomes robot or vocational qualification
physical sensor/control fields appear without exact authority and reality class
```

## Required evidence selection

The impact map returns candidate test obligations. The stage owner then marks each as:

```text
REQUIRED_EXECUTED
REQUIRED_BLOCKED
NOT_APPLICABLE_WITH_REASON
DEFERRED_WITH_WAKE_TRIGGER
```

Examples:

| Change | Minimum likely evidence |
|---|---|
| Root setup script | root route, Home separation, Windows/Mac syntax, HTTP health |
| World law | scenario, compiler, headless, replay |
| Browser control | semantic action, browser/self-play, accessibility |
| Team technique | deterministic timing, abort/recovery, balance, accessibility timing |
| World Witness | candidate-only boundary, privacy, scenario/refinement lineage |
| Godot adapter | package import, semantic/node separation, parity with headless oracle |
| Character reference asset | provenance, license, semantic rig map, replacement proof |
| LAN/model relay | identity binding, observer scope, lease/recovery, latency/fallback |

Not every change needs every test, but every returned obligation needs an explicit disposition.

## Cross-platform stability

The foundation CI runs on Linux, Windows, and macOS. Platform-specific setup and engine work may require additional evidence beyond CI.

```text
CI syntax pass
!= fresh-human setup proof

unit test pass
!= browser/game-feel proof

mock worker pass
!= real Qwen behavior
```

Cross-platform changes must identify:

```text
shared semantic behavior
platform adapter differences
filesystem/path assumptions
process ownership and shutdown behavior
network binding assumptions
artifact/toolchain acquisition
```

## Review relationship

The reviewer uses the impact receipt to avoid two failure modes:

```text
under-review
  only obvious files are considered; hidden consumers are missed

over-review
  the entire institution is reread even though the change is bounded
```

The correct route is:

```text
changed paths
→ mapped capabilities and anomalies
→ exact implicated sources/tests
→ explicit semantic stop
```

A reviewer may expand scope when evidence reveals a contradiction, unknown effect, broken dependency, or unplaced source. The expansion and reason must be recorded.

## Updating the map

Change the impact map when:

- a genuinely new canonical path or capability is accepted;
- an existing path changes semantic ownership;
- actual failures show that a consumer/test/anomaly relationship was missing;
- a generated or adapter boundary is added;
- a prior rule is too broad and masks useful distinctions.

Map changes are foundation-control changes and require their own tests. The map should evolve from observed failure and architecture, not merely from directory aesthetics.

## Compact rule

> Before asking whether a change passes, first make visible what it can affect. Treat unmapped source as a placement question, let the map select the smallest sufficient proof neighborhood, preserve all authority and truth-class boundaries, and improve the map when lived failures reveal a missing edge.

<!-- [VXG RealForever] -->
