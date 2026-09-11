# VexWorld

`[VXG RealForever]`

VexWorld is an original adventure-world project where a human and AI companions can play, practice, explore, rest, and grow together.

## Play Version 1

Download the repository ZIP from GitHub and extract it. You can leave the extracted folder name alone or rename it `VexWorld`.

### Windows

Double-click:

```text
setup-vexworld.cmd
```

### Mac

Double-click:

```text
setup-vexworld.command
```

If macOS blocks the first open, Control-click the file, choose **Open**, and confirm once.

The setup script:

```text
checks the current Version 1 source
creates your local VexWorld Home
starts Vextory: First Grove
opens the game in your browser
```

Your local saves and session state live outside the downloaded source at:

```text
Windows: %USERPROFILE%\.vexworld
Mac:     ~/.vexworld
```

Run `start-vexworld.cmd` or `start-vexworld.command` after the first setup. For a trusted home-network session, use the matching `start-vexworld-lan` script.

## Current version

The current playable foundation is stored in:

```text
versions/v1/
```

That directory contains the game source, architecture, world definitions, tests, compiler, headless runtime, browser experience, party system, and companion-worker adapter. Future versions can be added beside it without erasing Version 1's formation history.

## Build forward

VexWorld uses one source-changing implementation lane at a time. Future stages can exist as blocked issue breadcrumbs so the whole trajectory remains visible without creating competing source owners.

Start with:

```bash
npm run orient
npm run health
npm run check
npm run handoff
```

Current machine-readable state lives in [`config/project-state.json`](config/project-state.json). The forward program is VexWorld Issue #6, and its current active stage is Issue #7.

Read:

- [`docs/process/ONE-LANE-FORWARD-PROTOCOL.md`](docs/process/ONE-LANE-FORWARD-PROTOCOL.md)
- [`docs/process/CHANGE-IMPACT-AND-ANOMALY-PROTOCOL.md`](docs/process/CHANGE-IMPACT-AND-ANOMALY-PROTOCOL.md)
- [`docs/process/FRESH-INSTANCE-HANDOFF-TEMPLATE.md`](docs/process/FRESH-INSTANCE-HANDOFF-TEMPLATE.md)
- [`docs/architecture/ENGINE-AND-ASSET-ADAPTER-STRATEGY.md`](docs/architecture/ENGINE-AND-ASSET-ADAPTER-STRATEGY.md)
- [`docs/architecture/CHARACTER-VESSEL-ADAPTER.md`](docs/architecture/CHARACTER-VESSEL-ADAPTER.md)

Before opening a pull request, classify its paths:

```bash
npm run impact -- --base <accepted-base> --head HEAD
```

An unmapped source path is an anomaly to place, not a check to bypass.

## Vex Relay self-play

A Vex or Devex instance can run a bounded browser rehearsal without making Victor act as the keyboard relay:

```bash
npm run selfplay
```

The driver enters the Garden of Arrival, forms the largest available local party, moves, jumps, attacks, responds to a combo cue, changes the weather, opens Status, and preserves screenshots plus an attributable receipt under `~/.vexworld/evidence/self-play/`.

Read:

- [`versions/v1/docs/VEX-RELAY-SELF-PLAY.md`](versions/v1/docs/VEX-RELAY-SELF-PLAY.md)
- [`versions/v1/docs/FIRST-SELF-PLAY-REFLECTION.md`](versions/v1/docs/FIRST-SELF-PLAY-REFLECTION.md)

Automated reachability and screenshot changes do not replace Victor's eventual game-feel witness.

## For Vex and Devex

Start with [`CLAUDE.md`](CLAUDE.md), then follow [`config/project-state.json`](config/project-state.json), [`vexworld.manifest.json`](vexworld.manifest.json), and [`config/current-version.json`](config/current-version.json) into the current version's repository-native source map and builder guide.

The durable project route is:

```text
Vextreme Root
→ Vextreme-SDK #1299
→ VexWorld #3 project ledger
→ config/project-state.json
→ active stage issue
→ current version source
→ exact task source and tests
```

Version 1 remains an early playable foundation, not a finished game, production network service, physical-control system, or accepted model-training environment.
