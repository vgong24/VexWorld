# Contributing to VexWorld

VexWorld welcomes original code, worlds, art, sound, writing, tests, accessibility work, and design critique. The current bootstrap is intentionally small and may change rapidly.

## Before changing behavior

1. Find the semantic owner in `config/capability-graph.json`.
2. Read the related architecture and scenario source.
3. State what the change must accomplish and what it must not change.
4. Prefer a small source change plus proof over a large speculative framework.

## Required etiquette

- Preserve original or properly licensed assets and attribution.
- Do not copy another game's maps, characters, code, music, or concrete art.
- Keep engine/runtime bindings behind adapters.
- Keep player/companion identity separate from save slots, avatars, devices, models, and connections.
- Make model decisions high-level and interruptible; local deterministic logic owns per-frame movement and safety limits.
- Record meaningful assumptions and unknowns.
- Add or update scenarios before claiming a mechanic is complete.
- Run `npm run check`.
- Bind review to the exact candidate being reviewed.

## Finding classes

```text
BLOCKING
  violates a protected invariant, corrupts source truth, breaks deterministic proof,
  introduces unsafe authority, or prevents the claimed stage from working

MATERIAL_NONBLOCKING
  stage can proceed, but a named limitation, test, UX issue, or follow-up is owed

POLISH
  quality improvement that does not alter stage acceptance

QUESTION
  unresolved interpretation; not automatically a defect
```
