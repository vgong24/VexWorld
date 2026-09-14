# One-Lane Forward Protocol

`[VXG RealForever]`

**Protocol ref:** `protocol.vexworld.one-lane-forward/v1`  
**Project state:** [`config/project-state.json`](../../config/project-state.json)  
**Program epic:** `github.issue.vexworld.6`

## Purpose

VexWorld begins from a clean repository and should preserve that advantage. It does not need the full concurrency machinery used by older repositories with many active branches, but it does need enough process to ensure that a future Vex or Devex can determine:

```text
what is current
what is being changed
who owns the source-changing effect
what comes next
what evidence is owed
what remains unknown
how to stop, review, close and continue
```

The default topology while admitted forward work exists is therefore:

```text
one visible forward program
+ exactly one active source-changing stage
+ any number of blocked future breadcrumbs
+ bounded no-effect research and review
+ one accepted close receipt before activation moves
```

When an explicitly ordered architecture route is fully accepted and **no successor has been admitted**, the project may instead enter:

```text
forwardRouteDisposition=ATLAS_ROUTE_COMPLETE_IDLE
activeStageRef=NONE
activeStageIssueRef=NONE
active source-changing stage count=0
```

That terminal-idle state is navigation only. It does not invent a successor, reopen accepted work, or grant authority for a new product, physical, network, model, commercial, publication, or repository effect.

This is a development-flow rule, not a claim that one person or one model must do every kind of work.

## Project and stage states

Project forward-route dispositions:

```text
ACTIVE_FORWARD_ROUTE
ATLAS_ROUTE_COMPLETE_IDLE
```

`ACTIVE_FORWARD_ROUTE` retains the ordinary one-lane invariant: exactly one stage is both `sourceChanging=true` and `state=ACTIVE_SINGLE_FORWARD_LANE`.

`ATLAS_ROUTE_COMPLETE_IDLE` is the only zero-active exception. It requires:

```text
activeStageRef=NONE
activeStageIssueRef=NONE
zero ACTIVE_SINGLE_FORWARD_LANE + sourceChanging=true stages
terminal stage accepted
terminal stage sourceChanging=false
terminal acceptedCloseReceiptRef present
terminal acceptedMainRef present
lastAcceptedMainRef == terminal acceptedMainRef
```

Permitted stage states:

```text
FORMING
READY_FOR_ADMISSION
ACTIVE_SINGLE_FORWARD_LANE
BLOCKED_BY_PREDECESSOR
BLOCKED_BY_EXTERNAL_DECISION
REVIEW_CANDIDATE
NEEDS_CHANGES
ACCEPTED_COMPLETE
SUPERSEDED
PARKED
```

At most one stage may be both:

```text
sourceChanging=true
state=ACTIVE_SINGLE_FORWARD_LANE
```

A future stage may research options, collect official-source evidence, refine acceptance criteria, or prepare a no-effect handoff while blocked. It may not mutate overlapping canonical source or represent its future architecture as implemented.

## Exact entry route

A fresh builder on an active route enters through:

```text
config/project-state.json
→ active stage issue
→ README.md
→ CLAUDE.md
→ this protocol
→ config/change-impact-map.json
→ exact current-version source implicated by the stage
```

A fresh recipient in terminal-idle state enters through:

```text
config/project-state.json
→ completed programEpicRef / terminal close receipt
→ README.md
→ CLAUDE.md
→ this protocol
→ config/change-impact-map.json
→ exact accepted current-version source only as needed
```

No source-changing continuation is inferred from terminal idle. A newly admitted route must first establish its own exact source owner, authority, predecessor, scope and evidence contract.

A Root occupancy descends through:

```text
Root current entry
→ Vextreme-SDK #230
→ Vextreme-SDK #1299
→ VexWorld #3
→ config/project-state.json
→ active stage when ACTIVE_FORWARD_ROUTE
→ completed program/terminal receipt when ATLAS_ROUTE_COMPLETE_IDLE
```

Do not select a different predecessor because a nearby issue looks more recent. Stage order is explicit in project state.

## Stage admission

Before source mutation, the active stage must declare:

```text
stageRef
issueRef
predecessorStageRef or null
purpose
meaningOwnerRef
implementationOwnerRef
reviewOwnerRef
acceptedBaseRef
ownedPathPatterns[]
allowedEffects[]
forbiddenEffects[]
scenarioRefs[]
requiredCommandRefs[]
exitCriteriaRefs[]
knownUnknownRefs[]
returnRouteRef
```

The builder then:

1. freshly grounds remote and local repository state;
2. confirms that the stage is the only active source-changing lane;
3. checks proposed paths through `npm run impact`;
4. forms or updates scenarios before semantic implementation;
5. creates an owned branch from the exact accepted base;
6. records materially inferred assumptions rather than hiding them in code.

A GitHub issue, branch, label, or AI statement is coordination evidence. It is not by itself implementation, review, merge, network, model, physical, commercial, or publication authority.

## Source ownership and overlap

```text
ONE_EFFECT_OWNER_PER_SHARED_PATH
```

Several participants may advise or review one area. Only the admitted implementation owner changes a shared canonical path during the active stage.

When a proposed change touches multiple capabilities:

```text
one integrator owns the bounded source change
+ each semantic owner supplies an exact contract or review
```

Do not create a duplicate canonical owner merely to avoid coordination.

## Development loop

```text
question / desired experience / defect
→ classify meaning and affected capabilities
→ read exact source
→ define scenario and forbidden outcomes
→ implement canonical source
→ regenerate projections
→ run focused tests
→ run repository health and impact checks
→ run browser/headless/play witness when applicable
→ classify discrepancies
→ repair the correct layer
→ produce exact-head review handoff
```

Discrepancy classes include:

```text
IMPLEMENTATION_BUG
SCENARIO_GAP
CONTRACT_CONTRADICTION
EXPRESSION_PROBLEM
BALANCE_PROBLEM
ACCESSIBILITY_GAP
LOCALIZATION_GAP
PERFORMANCE_OR_LATENCY_GAP
PROVENANCE_OR_LICENSE_GAP
UNMAPPED_ARCHITECTURE
NEW_POSSIBILITY
UNKNOWN
```

Do not “fix the test” until the expected behavior, scenario, implementation, and source ownership have been distinguished.

## Change impact and anomaly check

Before review:

```bash
npm run health
npm run impact -- --base <accepted-base> --head HEAD
npm run check
npm run handoff
```

Every checked-in path must map through [`config/change-impact-map.json`](../../config/change-impact-map.json). An unmapped file means one of:

```text
new capability not placed
existing map incomplete
file in wrong location
unexpected generated or temporary residue
```

The correct response is classification and repair—not adding a broad wildcard merely to silence the anomaly.

## Review

The author may self-check but does not issue the independent acceptance disposition for its own exact source candidate.

A fresh reviewer must:

```text
re-ground base, head and tree
read stage purpose and effect boundary
run required evidence
inspect changed paths and impact receipt
inspect scenario and unknown coverage
confirm generated/source separation
confirm no hidden authority expansion
return stage-specific disposition
```

Valid dispositions:

```text
APPROVE_EXACT_HEAD
COMMENT_NONBLOCKING
REQUEST_CHANGES
SPLIT_REQUIRED
BLOCKED_MISSING_EVIDENCE
BLOCKED_AUTHORITY
```

Any source change invalidates an exact-head approval until the reviewer revalidates the new head.

## Stage close

A stage closes only after the exact candidate is accepted and the terminal receipt contains:

```text
schemaVersion=vexworld.stage-close-receipt/v1
stageRef
stageIssueRef
acceptedHeadRef
acceptedTreeRef
acceptedBaseRef
changedPathRefs[]
scenarioEvidenceRefs[]
testEvidenceRefs[]
humanOrBrowserWitnessRefs[]
reviewReceiptRefs[]
knownResidualRefs[]
whatItProves[]
whatItDoesNotProve[]
nextUnblockedStageRefs[]
nextActionOwnerRef
claimReleased=true
closedAt
```

If an immediate successor is already admitted, then and only then:

```text
current stage → ACCEPTED_COMPLETE
immediate successor → READY_FOR_ADMISSION or ACTIVE_SINGLE_FORWARD_LANE
project state's forwardRouteDisposition → ACTIVE_FORWARD_ROUTE
project state's activeStageRef → exact successor
project state's activeStageIssueRef → exact successor issue
```

If the explicit ordered route is exhausted and no successor is admitted, then and only then:

```text
current stage → ACCEPTED_COMPLETE
project state's forwardRouteDisposition → ATLAS_ROUTE_COMPLETE_IDLE
project state's activeStageRef → NONE
project state's activeStageIssueRef → NONE
active source-changing stage count → 0
lastAcceptedMainRef → terminal acceptedMainRef
```

Terminal idle is not a successor stage. It grants no source-changing authority and cannot be used to bypass formation/admission of later work.

A merged commit without a current project-state transition leaves navigation debt. A project-state transition without accepted source evidence is false currentness.

## Handoff

`npm run handoff` emits a bounded fresh-instance packet from live checked-in state. It should include:

```text
project and stage identity or explicit terminal-idle state
repository branch/head/tree observations
required reading route
changed/owned paths
allowed and forbidden effects
required commands and evidence
known unknowns
current candidate technology/asset decisions
close receipt shape
exact next owner/action
```

When `forwardRouteDisposition=ATLAS_ROUTE_COMPLETE_IDLE`, handoff must say explicitly:

```text
stage=null
activeStageRef=NONE
activeStageIssueRef=NONE
stage state=IDLE
nextStageRefOrNull=null
disposition=ATLAS_ROUTE_COMPLETE_IDLE__NO_SUCCESSOR_ADMITTED
```

It must not call terminal idle “ready for continuation” or imply active owned-path authority.

The generated packet does not grant authority and does not replace live repository grounding.

## Victor boundary

Victor should not become the routine message bus, Git operator, or test relay.

Victor enters when a genuinely protected human decision is required, such as:

```text
project purpose or culture
public license
meaningful aesthetic/product direction conflict
spending or commercial commitment
personal data or relationship consent
real-model/private-data connection
physical-world effect
irreversible repository or product decision
```

A missing timestamp, imperfect handoff phrase, or delayed playtest is a recoverable system-navigation issue—not a human failure.

## Compact rule

> Keep exactly one source-changing lane visible while admitted forward work exists; let future work remain mapped but blocked; make every effect descend from owned source and scenarios; test the affected neighborhood; invite a fresh exact-head review; close with a replayable receipt; and move the active coordinate forward. When the explicit route is fully accepted and no successor is admitted, record `ATLAS_ROUTE_COMPLETE_IDLE` with zero active lanes rather than inventing work. Never ask Victor to reconstruct the road.

<!-- [VXG RealForever] -->
