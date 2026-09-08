# web

The client: TypeScript and React, bundled by Vite, run with Bun. Deployed to
Cloudflare Pages from the repo on commit — see
[`docs/architecture.md`](../docs/architecture.md).

`public/oauth/client-metadata.json` is the OAuth client metadata document.
Vite copies `public/` into `dist/` verbatim, which is what puts it at
`/oauth/client-metadata.json`, and the `client_id` it declares has to equal
that URL. The client imports the same file for the scopes it requests, so the
two can't drift.

Editing it is a protocol change: a scope added is a scope every existing user
re-consents to. `bun run check` in `tools/lexicon-check` asserts what it has
to keep saying, and `just oauth` checks a deployed copy — the only way to tell
whether it arrived. Reasoning in [`docs/atproto.md`](../docs/atproto.md).
