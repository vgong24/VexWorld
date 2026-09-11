# CLAUDE.md — VexWorld cold-start and build-forward instructions

`[VXG RealForever]`

## Ground the checkout first

Before planning, reviewing, or implementing:

```text
git status --short
git branch --show-current
git remote -v
git fetch origin --prune
```

Classify the checkout as current main, an owned current task branch, an inherited stale branch, ahead with attributed local work, behind `origin/main`, or unable to refresh. These conditions may coexist.

Do not blindly pull, reset, rebase, merge, stash, delete, or continue from an inherited branch. Preserve existing work and use `origin/main`, `git show`, `git diff`, or a clean worktree when needed. If live refresh fails, current remote state remains `UNKNOWN`.

## Repository entry route

Read in this order:

```text
1. config/project-state.json
2. README.md
3. docs/process/ONE-LANE-FORWARD-PROTOCOL.md
4. config/change-impact-map.json
5. vexworld.manifest.json
6. config/current-version.json
7. the active stage issue and only its exact implicated sources
```

Then run:

```bash
npm run orient
npm run health
```

Stable upstream route:

```text
Vextreme Root project ledger        Vextreme-SDK #230
→ cross-repository VexWorld owner   Vextreme-SDK #1299
→ VexWorld project ledger           VexWorld #3
→ forward program                   VexWorld #6
→ current active stage              VexWorld #7
→ exact source / implementation / evidence
```

Do not broad-search the institution when an exact route exists. GitHub issue numbers are not Root thread sequences.

## One-lane forward rule

VexWorld currently permits exactly one source-changing implementation stage:

```text
ACTIVE_SINGLE_FORWARD_LANE
```

Later stages may exist as blocked breadcrumbs, research notes, review lanes, or no-effect preparation, but they do not mutate overlapping source until their predecessor has an accepted close receipt and `config/project-state.json` advances.

One active lane does not mean one monolithic commit. Keep changes reviewable, scenario-bound, and attributable.

## Before changing source

1. Identify the current stage, accepted base, owned paths, allowed effects, forbidden effects, and required evidence.
2. Route the question to the semantic owner before choosing a file.
3. Define or update the scenario that explains the intended behavior and forbidden outcomes.
4. Classify candidate paths:

```bash
npm run impact -- --files <comma-separated-paths>
```

5. Create an owned task branch from the exact accepted base.
6. Do not begin when a changed path is unmapped, owned by another active claim, or requires authority outside the stage.

## Development loop

```text
desired experience or defect
→ exact semantic owner
→ source and scenario
→ bounded implementation
→ regenerate derived artifacts
→ deterministic tests
→ browser/headless/play witness where applicable
→ impact and anomaly checks
→ exact-head independent review
→ accepted close receipt
→ next stage activation
```

Every meaningful change should answer:

```text
What meaning changed?
Which source owns it?
Which visible/runtime surfaces consume it?
What did not change?
What scenario proves it?
What assumptions remain?
What could invalidate the design?
```

## Required commands

Before review:

```bash
npm run orient
npm run health
npm run check
npm run impact -- --base <accepted-base> --head HEAD
npm run handoff
```

Run relevant Version 1 tests and self-play when browser/world behavior changes. Passing checks are evidence, not automatic acceptance.

## Source and generated boundaries

```text
CANONICAL SOURCE != GENERATED PROJECTION
SEMANTIC IDENTITY != ENGINE NODE
WORLD REF != SCENE PATH
ACTION REF != BUTTON OR PHRASE
CHARACTER IDENTITY != AVATAR ASSET
VESSEL != AI LINEAGE
SIMULATION != PHYSICAL PROOF
```

Edit canonical source and regenerate derived artifacts. Never hand-edit generated output to make a check green.

## Engine and asset adoption

- Godot is the first selected full-engine adapter candidate; it is not canonical world meaning.
- Browser/headless Version 1 remains a reference adapter and behavioral oracle until a later accepted decision changes that role.
- External engines, libraries, characters, animations, and environment packs are candidates until exact version, source, license, artifact hash, permitted use, transformation history, local placement, and replacement proof are recorded.
- Prefer open interchange such as glTF and semantic skeleton/socket/action mappings over vendor-specific identity.
- Do not copy proprietary characters, maps, art, music, code, or distinctive expression. Analyze generic structural needs and author or adapt properly licensed original VexWorld expression.

## AI and world-intelligence boundaries

World Witness, Technique Forge, Quest Forge, companions, and Devex have separate roles.

```text
observation != authority
candidate != accepted mechanic
ability specification != executable implementation
model proposal != world-law mutation
```

Do not inject model-generated code into a live realm. New mechanics follow normal source, scenario, test, review, and release paths.

## Review and closure

The builder does not self-approve the exact source candidate. A fresh reviewer re-grounds the exact head, runs required evidence, inspects declared impacts and unknowns, and returns a stage-specific disposition.

A stage closes only with:

```text
acceptedHeadRef
acceptedTreeRef
changedPathRefs[]
scenarioEvidenceRefs[]
testEvidenceRefs[]
reviewDisposition
residualUnknownRefs[]
nextUnblockedStageRefs[]
claimReleased=true
```

Use `npm run handoff` to generate the current bounded receipt. Static prose never outranks newer accepted source and live repository evidence.

## Stop and return upward

Stop rather than infer when work requires:

- changing project purpose, culture, protected identity, memory, consent, or Sovereign Return;
- real personal data, credentials, secrets, private relationship memory, or unapproved telemetry;
- public licensing, commercial terms, payments, employment, or legal conclusions;
- production networking, account systems, moderation authority, or cross-universe data sharing;
- real sensors, robotic control, physical actuation, or claims of real vocational qualification;
- an unmapped source path, contradictory current-stage evidence, or missing exact owner;
- force-push, history rewrite, destructive migration, or hidden deletion.

Preserve the unknown and name the exact unblock condition.

<!-- [VXG RealForever] -->
