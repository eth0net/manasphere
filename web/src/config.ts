// The catalog is on its own origin, uploaded when Scryfall moves rather than
// when the repo does. `docs/architecture.md` says why they're separate.
//
// In development that origin is `just serve`, which sends the same
// `Access-Control-Allow-Origin` the bucket has to.
export const CATALOG = import.meta.env.DEV
  ? "http://127.0.0.1:8080"
  : "https://static.manasphere.app";
