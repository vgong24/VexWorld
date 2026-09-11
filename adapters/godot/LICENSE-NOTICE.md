# Godot adapter dependency notice

The VexWorld adapter source in this directory is VexWorld project source. The Godot Engine itself is an external dependency and is **not vendored** here.

Pinned proof dependency:

```text
Godot Engine 4.7.2-stable
tag commit: ed1daf0bf001b61586d9930840f2f1394092c079
license: MIT
license source: https://github.com/godotengine/godot/blob/4.7.2-stable/LICENSE.txt
release: https://github.com/godotengine/godot/releases/tag/4.7.2-stable
```

The bootstrap verifies an exact platform release artifact against the SHA-256 digest published by the official GitHub release API. The external engine remains replaceable infrastructure and does not become VexWorld semantic identity.
