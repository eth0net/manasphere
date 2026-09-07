# OAuth

`client-metadata.json` is the document the `client_id` points at. It ships with
the app rather than being generated, because the client imports these same
bytes to decide what to request — see [`docs/atproto.md`](../../../docs/atproto.md).

Editing it is a protocol change, not a config change. `bun run check` in
`tools/lexicon-check` asserts what it has to keep saying.
