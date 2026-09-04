# Manasphere

An [atproto](https://atproto.com) AppView for tracking a Magic: The Gathering
collection — your cards live as records in your own PDS, not in someone else's
database.

MTG-first. Collection tracking now; scanner, valuation, deck building and a
game toolkit later.

## Status

Early scaffolding. Nothing runs yet.

## Stack

- Rust workspace — `axum` API, SQLite, a Jetstream firehose consumer and a
  Scryfall bulk-data sync, all in one binary.
- TypeScript PWA in `web/`, built with Bun and embedded into the binary at
  release time.

## Layout

```
crates/core            lexicon record structs, shared DB models
crates/api             axum route handlers
crates/jetstream       firehose consumer
crates/scryfall_sync   bulk-data fetch/parse
crates/appview         the binary that wires them together
lexicons/              NSID JSON schemas
web/                   frontend
docs/roadmap.md        phases, decisions and why
```

## Attribution

Developed with [Claude Code](https://claude.com/claude-code).
