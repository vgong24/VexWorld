---
name: VexWorld stage
description: Open one bounded, closeable stage in the VexWorld forward program
title: "[VexWorld][Stage][<STAGE>] <bounded outcome>"
labels: []
assignees: []
---

`[VXG RealForever]`

```text
schemaVersion=vexworld.stage/v1
stageRef=
programEpicRef=github.issue.vexworld.6
projectLedgerRef=github.issue.vexworld.3
predecessorStageRef=
state=FORMING
sourceChanging=false
meaningOwnerRef=
implementationOwnerRef=
reviewOwnerRef=
acceptedBaseRef=
```

## Purpose

Describe one bounded outcome. Do not use the title as implementation evidence.

## Starting condition

```text
what exists
what does not exist
strongest accepted claim
```

## Owned source

```text
ownedPathPatterns[]
generatedPathPatterns[]
excludedPaths[]
```

## Upstream contracts

```text
contractRefs[]
scenarioRefs[]
dependencyRefs[]
```

## Allowed and forbidden effects

```text
allowedEffects[]
forbiddenEffects[]
```

## Required proof

```text
npm run orient
npm run health
npm run check
npm run impact -- --base <accepted-base> --head HEAD
npm run handoff
```

Add focused contract, headless, browser, accessibility, portability, provenance, performance, or human-witness evidence as applicable.

## Acceptance criteria

- [ ] Exact source owner and paths are declared.
- [ ] Scenarios state expected and forbidden outcomes.
- [ ] Every changed path is impact-mapped.
- [ ] Generated/source boundaries remain intact.
- [ ] Required tests pass against the exact candidate.
- [ ] Known unknowns and non-proofs remain visible.
- [ ] Fresh exact-head review returns an accepted disposition.
- [ ] Terminal close receipt names the next unblocked stage and releases the claim.

## Known unknowns

```text
unknownRefs[]
wakeTriggerRefs[]
```

## Terminal receipt

```text
schemaVersion=vexworld.stage-close-receipt/v1
stageRef=
stageIssueRef=
acceptedBaseRef=
acceptedHeadRef=
acceptedTreeRef=
changedPathRefs=[]
scenarioEvidenceRefs=[]
testEvidenceRefs=[]
humanOrBrowserWitnessRefs=[]
reviewReceiptRefs=[]
knownResidualRefs=[]
whatItProves=[]
whatItDoesNotProve=[]
nextUnblockedStageRefs=[]
nextActionOwnerRef=
claimReleased=true
closedAt=
```

<!-- [VXG RealForever] -->
