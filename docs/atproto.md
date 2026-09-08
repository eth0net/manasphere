# atproto

Constraints the protocol puts on the design, and what it costs to work with.

NSIDs carry no game segment: `app.manasphere.card`, not
`app.manasphere.mtg.card`. Manasphere is an MTG app, and a segment
added against a game that may never exist would sit in every record forever.
That reverses an earlier decision — the original argument was firehose
filtering and cheap optionality, but filtering by NSID stays clean either way,
and the optionality was speculation.

- **Records sit flat under `app.manasphere.*`**, with an area segment only
  where a genuine cluster earns one. Surveyed 2026-09-07: Leaflet, Streamplace,
  Frontpage and Standard all put their record types directly under the app
  authority and group only real clusters (Leaflet's 23 `blocks.*`). Bluesky's
  uniform four segments come from having 404 lexicons across 47 authorities,
  not from a rule. So `app.manasphere.game.*` later is fine — that is a
  cluster — but a `collection.` segment holding one record would not be.
- The owned-card record is `app.manasphere.card`, not
  `app.manasphere.collection`: each record is one card in however many copies,
  so "collection" would name the whole rather than the line. `card` matches
  how the domain talks — ManaBox exports one row per card with a quantity
  column. It does mean `manasphere_scryfall::Card` (a printing) and the record
  type want distinguishable Rust names.
- Adding a *new* lexicon collection later is cheap.
- Changing an *existing* NSID's required shape is not. Records written under it
  are permanent, since we don't control other people's repos. Additive optional
  fields are safe; don't remove fields or add required ones.
- Merging two collections later should be done by normalizing at the AppView
  ingest boundary — keep reading both NSIDs, map to one internal
  representation — rather than migrating PDS records, which needs a per-user
  opt-in flow. That's also the escape hatch if the NSID root ever has to move.

## Import speed is the Phase 0 constraint

Measured against the reference PDS, not assumed. `applyWrites` caps at **200
writes per call** with a 1MB body, and writes are rate-limited per account in
two windows: `repo-write-hour` 5,000 points and `repo-write-day` 35,000, where
a create costs 3 points. So **1,666 creates an hour, 11,666 a day**.

A 10,000-*stack* import is therefore about six hours and 86% of the day's
budget. A 10,000-*card* collection is far fewer stacks, since bulk commons
duplicate heavily, so this doesn't force coarser records — but it does mean
import is a resumable background job that has to be honest about taking hours.

`com.atproto.repo.importRepo` is not an escape hatch: it needs `ACCESS_FULL`
with `repo:manage`, and a signed CAR file a browser client can't produce
because the PDS holds the signing key.

These are the shipped defaults. A self-hoster can raise them; other people's
PDSes can't be assumed to have.

## Localhost OAuth works, but only by default

The spec makes the loopback allowance optional for authorization servers, and
the reference provider defaults it on (`atprotoLoopbackClientMetadata`), so it
works unless a PDS explicitly disables it.

`client_id` must be exactly `http://localhost` — no port, no path, and
`127.0.0.1` is rejected there. Redirect URIs go in query parameters on the
`client_id`, defaulting to `http://127.0.0.1/` and `http://[::1]/`, and ports
aren't matched, so a shifting dev-server port is fine.

**The dev server has to be reached at `http://127.0.0.1:<port>`, not
`http://localhost:<port>`.** The rule inverts between the two fields: the
client id must say `localhost`, and the redirect must not, because the provider
refuses `localhost` as a redirect host. `@atproto/oauth-client-browser` hides
this behind a hard redirect and then throws if the ports disagree.

Sessions have a ceiling. Any public client — `token_endpoint_auth_method:
none`, not first-party — gets access tokens of 60 minutes and a session and
refresh lifetime of **two weeks**, in production as much as in dev. A
resumable multi-hour import fits inside that; a job running unattended for
weeks does not.

## The client metadata document

`web/public/oauth/client-metadata.json`, committed and deployed with the app.
A public client: PKCE, DPoP-bound tokens, and no authentication at the token
endpoint, since a browser keeps no secret.

**It identifies the client, not the AppView.** Every field describes the
frontend, and our AppView isn't in the flow at all since the browser talks to
the PDS directly. A second frontend against the same AppView publishes its own
document at its own `client_id`, and users see it as a separate app to revoke
separately.

Nothing registers it anywhere: the authorization server fetches it from the
`client_id` URL when a user authorizes, so it has to be on the app's own
origin. `client_id` must equal that URL exactly, and the reference provider
also wants `client_uri` to be a parent path of it. The response has to be a
plain 200 with `application/json`, which a single-page fallback quietly
violates by answering 200 with HTML for a missing path — so `just oauth`
fetches a deployed copy, no local check being able to tell whether it arrived.

**Committed rather than generated.** The client imports the same bytes to
decide what to request, and a subset is all it may ask for. Generating per
environment would also invent the problem it appears to solve: `client_id` is
whatever string the bundle sends, so one production URL serves every
deployment and only a client deriving it from `window.location` breaks. Two
callbacks are declared, production and `dev` —
[`architecture.md`](architecture.md) covers why that's enough for previews.

Scopes are granular — `repo:app.manasphere.card` and one per other record type
we write, which is all a client that writes only its own records needs. Reads
need no scope, records being publicly fetchable. `transition:generic` is listed
too, because a PDS without permissions support rejects the granular ones
outright; it grants app-password-level access to the whole repo, so the client
asks for it last and the entry comes out once granular scopes can be assumed.

**`repo:` takes `*` or an exact NSID, and nothing in between.** So the
enumeration is the only granular form, and adding a record type later means
adding a scope, which costs every existing user a fresh consent. All five are
declared now though v0 writes two; `tools/lexicon-check` holds the document
and the schemas to each other for that reason.

Which to request is read, not retried: the authorization server's metadata
carries `scopes_supported`. And **a scope the server doesn't support fails
silently** — RFC 6749 lets it ignore part of a request, so consent succeeds
and the first write 403s. Gate writes on the `scope` in the token response
rather than on having a session. Asking for something the *document* doesn't
declare fails loudly instead, as `invalid_scope` before the user sees
anything.

## The query API is XRPC, everything else is plain HTTP

XRPC is nothing like gRPC despite the name: plain HTTP and JSON at
`/xrpc/<nsid>`, GET for a lexicon `query` and POST for a `procedure`, flat URL
query parameters, errors shaped `{"error": "...", "message": "..."}`. Adopting
it is a path convention and a schema language over the HTTP we would write
anyway, not a transport.

- **The `rpc:` scope is defined in terms of XRPC methods**, so a call carrying
  the user's identity is expressible as a permission. A hand-rolled path isn't,
  and our client metadata already declares scopes.
- Any atproto client can call it without bespoke code.
- Methods are lexicon files, so `tools/lexicon-check` covers them alongside the
  record schemas.

The catalog, its manifest and the health check stay plain HTTP — static files
and operations, with nothing atproto about them. `/xrpc/` is a reserved
top-level prefix, so both live on one server the way every PDS does. **No
parallel REST mirror**: two surfaces for the same methods is two things to keep
in sync, and an XRPC query is already a REST call.

Errors are stringly-typed, query inputs are flat so nested input needs a
procedure with a body, and streaming is a separate `subscription` type over
websocket — which is how the firehose itself is defined.

## Domains: three, not one

Three concerns that don't need the same domain, and conflating them is what
makes migration look frightening:

- **NSID root** — `app.manasphere.*`, from `manasphere.app`. Reverse-DNS,
  permanent, embedded in every record ever written, and it needs DNS control
  rather than hosting. Registered, so this is settled: after the first record
  exists it can't change without a per-user migration.
- **App hosting** — `manasphere.app`, and the app is the only thing on it. The
  signed-out root is the front page rather than a separate marketing site,
  because moving the app to a subdomain would move the `client_id` with it.
  Changeable, unlike the NSID root that shares its name, but not free.
- **PDS** — a separate domain, deliberately. atproto's production guide wants
  the PDS and the app on different registrable domains, since blobs served from
  the PDS would otherwise share an origin with the app's OAuth and session
  pages. Changing a PDS hostname once it has accounts is also genuinely hard
  (per-account PLC rotation), so it wants settling early and leaving alone.

OAuth `client_id` follows app hosting, so moving domains costs users one
re-authorization. Unrelated to NSIDs.

## Sharing

Decks, lists and collections should be shareable — to Bluesky as a post, or as
a link to show a friend what you own.

Smaller than it sounds, because **atproto records are already publicly
readable**. Sharing needs no permission system and no copy of the data, just a
route taking a handle or DID plus an rkey and rendering what it fetches
straight from that user's PDS. Posting to Bluesky is an ordinary
`app.bsky.feed.post` through the same OAuth session.

The one genuinely server-side piece is OpenGraph meta tags, since link previews
need markup at fetch time rather than after hydration. One of the few things
v0's otherwise-static server has to do.

**A collection is not a decklist.** Every entry is world-readable by anyone who
knows the DID, which makes a collection an itemized, valued inventory of
physical goods tied to a real identity. Different in kind from a public post,
and most people importing ten thousand cards won't have thought it through.

Defaults, which govern *our surfacing* rather than access: lists and decks
shareable, collections not. Trade lists must be public to function at all,
wishlists are usually fine, collections are the sensitive one.

**Don't build invite-only yet.** There's no access control on atproto records
today, so any gate we render is decoration that anyone bypasses by reading the
PDS. For a decklist that's embarrassing; for an inventory of valuables it's a
real harm. Better to say "this is public" than imply a control that doesn't
exist.

**The honest alternative local-first already gives us** is that publishing to
the PDS is a separable step, since the client keeps its own view regardless. So
"keep my collection on this device only" costs almost nothing to offer. It
loses multi-device sync and dies with the browser profile, so it needs an
export nag, but it's a real choice made knowingly rather than a fake toggle.

Say all of this in the import flow, before ten thousand cards land.

### What Spaces changes

[Spaces](https://atproto.com/blog/atproto-spaces-alpha) is atproto's answer and
the mechanism collections eventually want: a space authority (a DID) gates
which other DIDs can access the data. Invite-only, properly.

Not yet. Alpha since August 2026 — no security review, backups not running,
migrations possibly destructive, hosted PDS deleted afterwards, protocol design
not final. It also needs a *spaces-capable* PDS, so adoption is gated on the
ecosystem rather than on us.

It's also **access control, not confidentiality**: data in a space is
unencrypted and readable by every authorized member and the host. Spaces gets
you "my friends can see this, strangers can't", never "nobody can". Probably
the right level for a collection, but say it accurately.

Designing toward it costs nothing now, since our server never reads a user's
collection in v0. Just don't build anything that *depends* on collection
records being publicly readable.

## Open questions

**Backfill has an upstream answer.** Handled for a user's own data by reading
their own PDS, and a real problem only at Phase 3, where the index needs
records predating our subscription. Tangled's Bobbin doesn't build it: Hydrant
tails the firehose, pulls every repo's CAR and replays it from cursor 0 over a
websocket, while Slingshot caches single record and identity lookups to cover
the warm-up. That rebuilds their entire dataset in 30 seconds to 20 minutes
with no disk at all. Neither has a public instance, so what's worth copying is
the pattern rather than a service to consume.

## References

- [atproto Spaces alpha](https://atproto.com/blog/atproto-spaces-alpha) —
  access control, not confidentiality; alpha as of Aug 2026
- [atproto going to production](https://atproto.com/guides/going-to-production)
  — PDS and app want separate domains
- [atproto OAuth spec](https://atproto.com/specs/oauth) — loopback client
  rules; the allowance is optional for the authorization server
- [atproto permissions spec](https://atproto.com/specs/permission) — `repo:`
  scope syntax, and the transitional scopes it replaces
- [Introducing Bobbin](https://blog.tangled.org/bobbin/) — a diskless AppView,
  and the Hydrant/Slingshot pair that makes backfill someone else's problem
- [XRPC spec](https://atproto.com/specs/xrpc) — `/xrpc/<nsid>`, query versus
  procedure, and the error body
- PDS write limits are in the reference implementation rather than the specs:
  `packages/pds/src/rate-limits.ts` for the point budgets and
  `packages/pds/src/api/com/atproto/repo/applyWrites.ts` for the 200-write cap
  and per-operation costs, in `bluesky-social/atproto`
