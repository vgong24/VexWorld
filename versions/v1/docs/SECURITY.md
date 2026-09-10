# Prototype security boundary

The LAN server is a development convenience, not a production security system.

- It uses a bearer token printed in the terminal.
- Session JSON is stored unencrypted under `.vexworld-data/`.
- It assumes a trusted home network.
- It has no account recovery, user directory, TLS termination, rate limiting, or durable adversarial identity proof.
- Do not port-forward it or expose it to the public internet.
- Do not place private memories, credentials, or secrets in companion observations.

A production shared-world protocol requires separate Security, Universe Federation, privacy, abuse, identity, and operations work.
