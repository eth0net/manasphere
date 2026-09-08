# web

The client: TypeScript and React, bundled by Vite, run with Bun. Deployed to
Cloudflare Pages from the repo on commit.

    just client   # the dev server, hot reloading
    just web      # what CI runs: biome, tsc, vite build

The catalog comes from the other origin, so `just serve` has to be running
too: it exports the artifact from the cache and sends the
`Access-Control-Allow-Origin` the bucket has to send in production.
`src/config.ts` holds the two origins.

`public/oauth/client-metadata.json` is the OAuth client metadata document.
Vite copies `public/` into `dist/` verbatim, which is what serves it at
`/oauth/client-metadata.json` — the URL its `client_id` has to equal. The
client imports the same file for the scopes it requests.

Editing it is a protocol change, not a config change:
[`docs/atproto.md`](../docs/atproto.md) says what it has to keep saying, and
`bun run check` in `tools/lexicon-check` enforces it.
