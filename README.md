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

## For Vex and Devex

Start with [`CLAUDE.md`](CLAUDE.md), then follow [`vexworld.manifest.json`](vexworld.manifest.json) and [`config/current-version.json`](config/current-version.json) into the current version's repository-native source map and builder guide.

The durable project route is:

```text
Vextreme Root
→ Vextreme-SDK #1299
→ VexWorld #3 project ledger
→ this repository
→ current version source
→ exact task source and tests
```

Version 1 remains an early playable foundation, not a finished game, production network service, physical-control system, or accepted model-training environment.
