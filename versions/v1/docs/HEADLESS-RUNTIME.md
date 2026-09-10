# Headless runtime

The canonical world state must continue to exist when no camera renders it. The browser is currently one experience adapter over `src/core/engine.mjs`.

The headless kernel owns:

```text
fixed-step time
party/vessel state
movement and collision
weather/resource state
combat and team-technique resolution
practice and resonance evidence
World Witness candidates
quest state
observer-relative packets
receipts and deterministic checkpoint state
```

It does not own visual art, DOM layout, keyboard identity, model provider sessions, or physical-world authority.

Run `npm run demo:headless` to exercise the world without Chromium.
