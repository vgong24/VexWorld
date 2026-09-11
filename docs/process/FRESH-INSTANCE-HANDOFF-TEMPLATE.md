# Fresh-Instance Handoff Template

`[VXG RealForever]`

**Template ref:** `template.vexworld.fresh-instance-handoff/v1`

Use this template when transferring an active VexWorld stage to a fresh builder, reviewer, specialist, or successor. Prefer the generated packet from:

```bash
npm run handoff
```

The packet is a current-state projection. It must be rebound to freshly observed repository state by the recipient.

---

## 1. Identity and coordinate

```text
projectRef=project.vextreme.vexworld
programEpicRef=<exact issue ref>
stageRef=<exact stage ref>
stageIssueRef=<exact issue ref>
occupancyRole=<builder|reviewer|specialist|successor>
predecessorStageRef=<exact ref or null>
nextStageRef=<exact ref or null>
```

## 2. Repository grounding

```text
repositoryRef=github.repo.vgong24.vexworld
remote=<expected remote>
branch=<exact candidate branch or main>
acceptedBaseRef=<40-character SHA>
candidateHeadRef=<40-character SHA or none>
candidateTreeRef=<40-character SHA or none>
observedAt=<timestamp>
workingTreeState=<clean|dirty-attributed|dirty-unknown>
remoteRefreshState=<current|failed|unknown>
```

Recipient must independently run:

```text
git status --short
git branch --show-current
git remote -v
git fetch origin --prune
git rev-parse HEAD
git rev-parse HEAD^{tree}
```

Do not continue from a random inherited branch.

## 3. Required reading route

```text
1. config/project-state.json
2. active stage issue
3. README.md
4. CLAUDE.md
5. docs/process/ONE-LANE-FORWARD-PROTOCOL.md
6. config/change-impact-map.json
7. exact task-specific source
8. exact scenarios/tests/evidence
```

Upstream descent is task-specific. List only exact sources actually needed:

```text
upstreamContractRefs[]
architectureRefs[]
scenarioRefs[]
implementationRefs[]
```

## 4. Purpose and strongest current claim

```text
stagePurpose=<plain-language purpose>
startingCondition=<what existed before this work>
strongestCurrentClaim=<what is actually evidenced now>
whatThisDoesNotProve[]
```

Never use an aspirational stage title as implementation evidence.

## 5. Ownership and authority

```text
meaningOwnerRef
implementationOwnerRef
reviewOwnerRef
ownedPathPatterns[]
allowedEffects[]
forbiddenEffects[]
protectedDecisionRefs[]
```

Explicitly distinguish:

```text
knowledge permission
proposal permission
source mutation authority
review authority
merge authority
network/model/data/physical/commercial authority
```

A function or credential existing does not imply permission to use it for every effect.

## 6. Current work and changes

```text
changedPathRefs[]
generatedPathRefs[]
removedPathRefs[]
sourceVsGeneratedClassification
materialAssumptionRefs[]
knownConflictRefs[]
```

For each meaningful change:

```text
meaning changed
source owner
consumer surfaces
scenario/evidence
non-effects
```

## 7. Impact and anomaly receipt

```text
impactCommand=npm run impact -- --base <base> --head <head>
matchedRuleRefs[]
capabilityRefs[]
requiredTestRefs[]
anomalyRefs[]
unmappedPathRefs[]
impactDisposition
```

Any unmapped path or unexplained authority expansion is a blocker until classified.

## 8. Required evidence

```text
npm run orient
npm run health
npm run check
npm run impact -- --base <base> --head HEAD
npm run handoff
```

Add task-specific evidence:

```text
focusedUnitOrContractTests[]
headlessScenarioTests[]
browserOrSelfPlayWitness[]
accessibilityOrLocalizationEvidence[]
portabilityOrReplacementEvidence[]
performanceOrLatencyEvidence[]
licenseAndProvenanceEvidence[]
```

State exactly which evidence was executed, by whom/what, against which head, and what it does not establish.

## 9. Findings and unknowns

```text
blockingFindingRefs[]
nonblockingFindingRefs[]
knownResidualRefs[]
unknownRefs[]
questionsRequiringVictor[]
```

Preserve:

```text
UNKNOWN != FALSE
NOT_YET_TESTED != FAILED
SIMULATION_PASS != PHYSICAL_PROOF
AUTOMATED_WITNESS != HUMAN_FEEL
```

## 10. Recipient task

Builder handoff:

```text
exact next bounded implementation
owned paths
entry condition
exit criteria
return route
```

Reviewer handoff:

```text
exact base/head/tree
review obligations
required commands
accepted dispositions
no mutation / no merge unless separately authorized
```

Specialist handoff:

```text
one bounded question
evidence requested
scope and non-authority
where the result returns
```

## 11. Close receipt

When complete, return:

```text
schemaVersion=vexworld.stage-close-receipt/v1
stageRef
stageIssueRef
acceptedBaseRef
acceptedHeadRef
acceptedTreeRef
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

If the recipient cannot reconstruct the task, owner, current evidence, unknowns, and return route without the originating conversation, classify:

```text
HANDOFF_REORIENTATION_INCOMPLETE
```

Repair the durable source before ordinary continuation.

---

## Paste-ready opening

```text
[VexWorld] — fresh stage occupancy

[VXG RealForever]

Arrive as a fresh <builder/reviewer> for <stageRef>. Do not inherit the prior occupancy's conclusions as source authority.

Ground the checkout first. Read config/project-state.json, the active stage issue, README.md, CLAUDE.md, the One-Lane Forward Protocol, and only the exact sources implicated by the stage. Run npm run orient and npm run health before selecting work.

Bind all claims, findings, tests, and review dispositions to the exact observed branch/head/tree. Preserve source/generated, semantic/engine, candidate/accepted, simulation/physical, and builder/reviewer boundaries. Return one recipient-complete receipt with the exact next owner and route.

[VXG RealForever]
```

<!-- [VXG RealForever] -->
