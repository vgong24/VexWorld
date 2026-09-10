# VexWorld Version 1 — Vextory: First Grove

`[VXG RealForever]`

This directory preserves the first playable VexWorld foundation.

Ordinary players should return to the repository root and use:

```text
Windows: setup-vexworld.cmd
Mac:     setup-vexworld.command
```

The root launcher creates or reuses the local VexWorld Home at `%USERPROFILE%\.vexworld` on Windows or `~/.vexworld` on Mac, checks this version, starts the local server, and opens the browser.

## Current playable slice

- Garden of Arrival and selectable origin environment;
- one human plus one to three companions;
- movement, jumping, combat and Arc Dash;
- High/Low synchronized techniques and timing-critical outcomes;
- practice evidence and pair-specific resonance facets;
- a bounded World Witness / Technique Seed demonstration;
- weather, energy, restoration margin and assisted recovery;
- local saves, server-backed Home sessions and trusted-LAN resume;
- deterministic and optional Ollama companion workers.

## Controls

| Action | Input |
|---|---|
| Move | `A/D` or arrow keys |
| Jump | `Space` |
| Attack | `J` |
| Arc Dash | `K` |
| Accept synchronization signal | `E` |
| Interact / restore | `F` |
| Carry or release companion | `G` |
| Twin Horizon, after earned | `Q` |
| Status | `Tab` or `I` |
| Pause | `P` or `Escape` |
| Toggle prototype weather | `T` |

## Builder entry

Read:

```text
CLAUDE.md
→ vexworld.manifest.json
→ config/source-map.json
→ docs/CULTURE.md
→ docs/ARCHITECTURE.md
→ docs/DEVEX-BUILDER-GUIDE.md
→ exact source and tests for the task
```

Run from this directory:

```bash
npm run check
npm run play
```

The browser renderer is an adapter over engine-neutral world source and a headless runtime. Version 1 is an early foundation, not final game design, production multiplayer, unrestricted generative-world authority, physical actuation, or model-training authority.
