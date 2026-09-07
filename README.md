# Manasphere

An [atproto](https://atproto.com) AppView for tracking a Magic: The Gathering
collection — your cards live as records in your own PDS, not in someone else's
database.

MTG-first. Collection tracking now; scanner, valuation, deck building and a
game toolkit later.

## Status

Pre-v0. The card cache works: `crates/scryfall` streams Scryfall's bulk data
and `crates/core` shreds 117,630 printings into a 94MB SQLite file with
full-text name search. No server, no client and no lexicons yet.

## Stack

- Rust workspace — `axum` API, SQLite, a Jetstream firehose consumer and a
  Scryfall bulk-data sync, all in one binary.
- TypeScript PWA in `web/`, built with Bun and embedded into the binary at
  release time.

## Layout

```
crates/core            lexicon record structs, shared DB models
crates/api             axum route handlers
crates/appview         the binary that wires them together
crates/jetstream       firehose consumer
crates/scryfall        bulk-data fetch/parse
docs/roadmap.md        phases, decisions and why
lexicons/              NSID JSON schemas
web/                   frontend
```

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Commits need a DCO sign-off
(`git commit -s`); there's no CLA.

## Licence

The AppView is licensed under [AGPL-3.0](LICENSE) — self-host it freely, but if
you run a modified version as a network service, your users get the source.

`lexicons/` is [MIT](lexicons/LICENSE) instead. NSID schemas are shared
vocabulary, and copyleft on a schema file would discourage the adoption that's
the whole point of publishing them.

Card data and images come from [Scryfall](https://scryfall.com) under the
Wizards of the Coast Fan Content Policy. Manasphere is unofficial Fan Content
permitted under the Fan Content Policy. Not approved or endorsed by Wizards.
Portions of the materials used are property of Wizards of the Coast.
©Wizards of the Coast LLC.
