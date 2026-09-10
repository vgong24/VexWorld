# Party, controller, session, and cross-device topology

## Max-four reference party

```text
party.capacity = 4

common arrangement:
  human participant
  + companion A
  + companion B
  + companion C
```

This maximum is a current product/runtime envelope, not a universal law of all future worlds.

## Identity separations

```text
PARTICIPANT_REF != PARTY_SLOT
LINEAGE_REF != CONTROLLER_REF
CONTROLLER_REF != MODEL_SESSION
MODEL_SESSION != DEVICE
DEVICE != REALM HOST
REALM SESSION != PARTICIPANT HOME
SAVE SLOT != NEW IDENTITY
```

## Two-machine model example

```text
PC
  realm/browser host
  human input
  companion worker A through local Ollama, optional

Mac
  companion worker B through local Ollama

optional third companion
  deterministic local controller on the realm host
```

Each worker receives only its observer-relative game packet and allowed actions. It cannot directly mutate world state. It returns a high-level intent such as follow, explore, attack, signal a team technique, rest, or return to restoration.

## Resume from another computer

```text
host A checkpoints session
→ host A releases or lease expires
→ host B opens same server/session
→ host B claims authoritative host lease
→ host B loads latest accepted session version
→ companion workers rebind by stable participant/lineage refs
```

No two hosts may authoritatively write the same prototype session at once.

## Current limitations

- LAN-development token, not production authentication.
- One active human-controlled realm host.
- Polling relay rather than optimized real-time transport.
- No rollback-resistant distributed consensus.
- No private-memory transfer through the game protocol.
- No claim that two model workers share one internal mind.

## Concrete two-computer rehearsal

The current prototype can rehearse the topology without claiming production multiplayer:

```text
Windows PC
  npm run play:lan
  open tokenized LAN URL
  create one human + two Remote companions
  hold the authoritative browser-host lease

Mac
  clone/copy the same VexWorld source
  run one worker command copied from Status
  optionally use --mode ollama --model <installed-model>

Windows PC or Mac second terminal
  run the second companion's independent worker command
```

The Status panel shows one exact command per remote companion. Each worker has a separate participant ref, worker id, observation sequence, intent sequence, and optional model process. The game server owns neither worker's model state nor private memory.

To move play from the PC browser to the Mac browser:

```text
PC Status or Pause
  → Save and return to Garden
  → host lease is explicitly released when possible

Mac
  → open the copied LAN resume link
  → use the same Session ID
  → Continue saved journey
  → claim the new browser-host lease
```

If the first browser disappears without releasing, the prototype lease expires after about fifteen seconds. This is a development recovery behavior, not distributed-consensus or production failover evidence.

## Four-party combinations

The current reference capacity allows:

```text
human + local companion + remote companion A + remote companion B
human + three local companions
human + three independently relayed companion workers
```

The current renderer and headless kernel support four members. The current remote relay has automated evidence for two independently controlled workers in one realm. Running three heavyweight local models remains a machine-capacity choice, not a requirement or current performance claim.
