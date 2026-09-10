# First Grove playtest guide

## Start

From repository root, run the platform setup script. For a developer terminal route:

```bash
npm run check
npm run play
```

Open the printed URL and choose one to three companions.

## Suggested first walk

1. Move right and jump across the broken ground.
2. Fight Spriglets with `J`; use `K` for Arc Dash.
3. Watch for a companion's **High / Low** signal and press `E` near the timing center.
4. Repeat strong coordination across more than one enemy.
5. Notice the Echo Gate appear in the east after the world forms a Technique Seed.
6. Interact with the gate using `F`, then earn an Excellent or Critical synchronized attack against the Echo Warden.
7. Use learned Twin Horizon with `Q` while the originating companion is nearby.
8. Toggle rain with `T`, travel outward, inspect Status with `Tab`, and observe return-margin changes.
9. Let a companion become low on energy, approach it, and press `G` for assisted transport back to the Sunbloom Hearth.

## Full-party check

Start a new save with three companions. Confirm:

- all four party identities remain distinct;
- the camera follows the human while companions continue offscreen;
- different companions can signal coordination;
- controller labels are visible in Status;
- frame rate and UI remain usable.

## LAN and remote worker

Run:

```bash
npm run play:lan
```

Use the LAN URL on the second computer. For one companion configured as `Remote test worker`, copy the exact worker command from the Status panel and run it on the second machine.

For Ollama, replace `<token>` and run with `--mode ollama --model <your-model-name>`.

## Record

Please preserve:

```text
machine and browser
party composition
save/session mode
what felt fun
what was confusing
bugs and reproduction steps
combo timing feel
companion behavior surprises
performance
what you expected but could not do
```

## PC + Mac + two companion workers

1. On the machine hosting the realm, run `npm run play:lan`.
2. Open the printed LAN URL and select two companions.
3. Set each companion controller to `Remote Ollama worker` or use one remote Ollama and one remote deterministic worker for the first rehearsal.
4. Enable the LAN session and choose a stable Session ID.
5. Begin, open Status, and copy each companion's exact worker command.
6. Run one command on the Mac and the other in a second terminal or second machine.
7. Confirm each companion loses its `fallback` marker and behaves independently.
8. Use **Copy LAN resume link**, then **Save and return to Garden**.
9. Open that link on the other computer, use the same Session ID, and continue the journey.

Current proof boundary:

```text
max-four party kernel         automated
four-member browser rendering exercised
two independent worker relay automated
mock Ollama structured intent automated
real PC/Mac network          human playtest owed
real local Qwen behavior      human/model playtest owed
production Internet hosting   unsupported
```
