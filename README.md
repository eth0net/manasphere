# Manasphere

An [atproto](https://atproto.com) AppView for tracking a Magic: The Gathering
collection — your cards live as records in your own PDS, not in someone else's
database.

MTG-first. Collection tracking now; scanner, valuation, deck building and a
game toolkit later.

## Status

Pre-v0, and it runs. `crates/scryfall` streams Scryfall's bulk data,
`crates/core` shreds 117,630 printings of 38,633 cards into an 81MB SQLite
file, and the `manasphere` binary turns that into the static site a browser
needs — a 3.67MB client artifact and the OAuth client metadata document. The
lexicons are validated against atproto's own implementation in CI. No client
yet.

## Stack

- Rust workspace — `axum` API, SQLite, a Jetstream firehose consumer and a
  Scryfall bulk-data sync, all in one binary.
- TypeScript PWA in `web/`, built with Bun and deployed to a CDN alongside the
  catalog artifact. Nothing a browser fetches comes from the binary.

## Layout

```
crates/scryfall        bulk-data fetch/parse
crates/core            card cache, and the artifact the client caches
crates/api             axum route handlers
crates/appview         the `manasphere` binary
docs/                  roadmap, and the reasoning behind each decision
lexicons/              NSID JSON schemas
```

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Commits need a DCO sign-off
(`git commit -s`); there's no CLA.

## License

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
