# Contributing to VexWorld

Start with `CLAUDE.md` and the current version in `config/current-version.json`.

For a gameplay or architecture change:

```text
find its semantic owner
→ update a scenario or explain why none applies
→ change canonical source
→ regenerate derived output
→ run npm run check
→ play the affected path
→ report what changed, what remains unknown, and what the change does not prove
```

Keep game assets and expressions original or explicitly licensed. Do not put private VexWorld Home state, credentials, model files, or personal memories in the repository.
