# Companion controller adapter

## Contract

The world produces a bounded observer-relative packet. A controller returns one allowed semantic intent.

```text
world observation
→ controller adapter
→ participant intent
→ local motor/reflex
→ authoritative world receipt
```

Allowed prototype intents:

```text
FOLLOW_HUMAN
EXPLORE_LEFT
EXPLORE_RIGHT
ATTACK_NEAREST
SIGNAL_HIGH_LOW
RETURN_TO_RESTORATION
REST
HOLD_POSITION
```

The controller does not receive arbitrary source access, filesystem access, network tools, secrets, or direct state mutation.

## Controller classes

```text
LOCAL_DETERMINISTIC
  built-in behavior; always available

REMOTE_DETERMINISTIC
  companion-worker process; useful for transport tests

REMOTE_OLLAMA
  local model on another machine; high-level event-driven intent only
```

If a remote controller becomes stale, the vessel safely falls back to `HOLD_POSITION`, `FOLLOW_HUMAN`, or `RETURN_TO_RESTORATION` according to current resource state. It does not fabricate continued model decisions.

## Ollama adapter

The worker calls the local Ollama chat API with JSON output, a fixed allowed-action schema, and `stream=false`. Model name and endpoint remain configurable. No game source or private human memory is sent unless explicitly added to the observation contract in a separately reviewed change.

## Worker lifecycle and testing

Continuous worker:

```bash
npm run agent -- \
  --server http://<realm-host>:4173 \
  --token <development-token> \
  --session first-grove-home \
  --companion participant.companion.vex \
  --mode ollama \
  --model <installed-model>
```

One-cycle transport/evaluation probe:

```bash
npm run agent -- ... --once
```

A worker heartbeat, observation, and intent are attributable to the exact companion participant. Two workers may use different machines, model families, or controller classes without changing either companion lineage identity.
