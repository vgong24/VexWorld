# Autonomous Version 1 playtest — 2026-09-10

`[VXG RealForever]`

## Purpose and boundary

A Vex author/tester exercised Version 1 through ordinary browser input and a bounded local playtest relay. The relay did not mutate game state directly, invoke a model, read private memory, or create a physical effect.

```text
observedRepositoryBaseRef=github.commit.vexworld.ad3a29c3d432542cf5125a21a3f9875ca5a1c1c6
playtestClass=AUTONOMOUS_BROWSER_INPUT_AND_OBSERVATION
humanFeelWitness=false
realModelWorker=false
physicalEffectPossible=false
```

Evidence here is direct observation of one local Chromium environment. It is not universal gameplay, accessibility, platform, networking, or model-quality acceptance.

## Story route completed

```text
Garden of Arrival
→ First Grove
→ three distinct High / Low synchronized criticals
→ World Witness Technique Seed
→ Echo Gate reveal
→ Echo Warden resonance trial
→ fourth synchronized critical
→ Twin Horizon learned
→ Twin Horizon used
→ rain and Status orientation
```

Observed synchronization results:

| Encounter | Result | Timing delta |
| --- | --- | ---: |
| Spriglet 01 | `SYNCHRONIZED_CRITICAL` | `-2.66 ms` |
| Spriglet 02 | `SYNCHRONIZED_CRITICAL` | `+1.70 ms` |
| Mossback 01 | `SYNCHRONIZED_CRITICAL` | `+10.67 ms` |
| Echo Warden | `SYNCHRONIZED_CRITICAL` | `-7.63 ms` |

The final story observation reported:

```text
Technique Seed       TRIAL_READY
Echo Gate            REVEALED
Twin Horizon trial   COMPLETE
Twin Horizon         learned=true
Reality class        FICTIONAL_WORLD
Physical effect      false
Page errors           0
Console errors        0
```

## Full-party route completed

A second local run used:

```text
Victor + Vex + Mira + Rowan = 4 / 4 party
```

The human traversed to the eastern grove and all three deterministic companions crossed the platform gaps and rejoined within the current cohesion envelope.

Observed positions near the eastern grove:

```text
Victor  x≈3518
Vex     x≈3259
Mira    x≈3289
Rowan   x≈3259
```

All four participants retained distinct refs, party entries, resource states, and status projections. No browser page or console error was observed.

## Defects found through inhabiting the world

The route exposed several problems that source/unit tests alone had not made sufficiently visible:

1. `/` served the game document without redirecting to its real directory, causing relative CSS/module requests to resolve incorrectly.
2. pressed browser actions could be consumed on a render frame before a simulation step and disappear.
3. one far-left restoration point made the eastern half of the map operationally unreasonable.
4. human rest was cleared every frame instead of persisting until an actual action.
5. companions could stop at gaps, chase obsolete enemies behind the human, or remain on a ledge above restoration.
6. clustered participant name labels could overlap.
7. the browser lacked a bounded, auditable way for Vex/Devex to play through ordinary input and observe results.

The tested refinement corrects these through a static-root redirect, queued-input sampling at simulation-step time, distributed restoration points, persistent rest, cohesion-aware traversal/drop behavior, collision-aware label placement, and an opt-in Vex Relay Protocol.

## Builder reflection — interpretation, not acceptance evidence

> The Echo Gate reveal was the first moment the architecture felt like a world noticing how two participants had learned to act together, rather than a test harness awarding a predetermined level-up. The High / Low timing result felt gratifying because the critical belonged to coordination. Twin Horizon was simple, but it read as a small celebration of something the pair had demonstrated.

The Garden of Arrival felt warm and intimate enough to support the intended beginning. The procedural art is visibly placeholder-level, yet it has a coherent original personality. The full party made the world feel more alive, although companions still need richer individual expression, goals, dialogue, and spatial coordination.

## What remains genuinely open

```text
Victor/human gameplay feel and accessibility witness
Windows and Mac one-click setup on the actual machines
real PC ↔ Mac LAN resume
one real local Ollama/Qwen companion worker
two concurrent real-model workers under actual machine budgets
controller/gamepad and touch refinement
richer origin environments rather than palette/weather variants
more expressive companion animation/personality
long-session save migration and recovery
production identity/security/networking
multi-human party play
general World Witness incubation beyond fixed Twin Horizon
overall combat, progression, encounter, and economy design
```

<!-- [VXG RealForever] -->
