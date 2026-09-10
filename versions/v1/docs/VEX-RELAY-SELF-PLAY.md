# Vex Relay self-play

`[VXG RealForever]`

## Purpose

A Vex or Devex instance should be able to enter the current browser world as an
observer/test driver, perform a small attributable action sequence, preserve
screenshots and state observations, and return findings without requiring
Victor to become the manual input relay.

The Version 1 driver lives at:

```text
scripts/vex-relay-self-play.mjs
```

Run it from `versions/v1`:

```bash
node scripts/vex-relay-self-play.mjs
```

Use the following when a visible browser is useful:

```bash
node scripts/vex-relay-self-play.mjs --headed
```

Evidence is written under:

```text
~/.vexworld/evidence/self-play/
```

by default, outside the downloaded source. Use `--out=<folder>` for a temporary
or CI-owned destination.

## Current sequence

```text
Garden of Arrival rendered
→ largest available local party selected
→ enter First Grove
→ move right
→ jump + attack
→ Arc Dash + combo response
→ change prototype weather
→ open Status
→ preserve screenshots + body/state observations + errors
```

## Authority boundary

The driver uses browser input and observation only. It does not become world
law, modify source, invoke an LLM, publish artifacts, grant abilities, control a
physical vessel, or claim that an automated run proves fun.

```text
SCRIPTED_REACHABILITY != HUMAN_PLAYTEST
SCREENSHOT_CHANGE != GOOD_GAME_FEEL
NO_PAGE_ERROR != COMPLETE_GAME
```

## Expansion path

Future drivers may consume a source-managed replay/scenario instead of a fixed
sequence, connect through the companion-worker relay, compare deterministic and
local-model decisions, and return timing/performance evidence. Each expansion
must preserve participant identity, action attribution, reality class, and the
current world generation.
