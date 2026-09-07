# Manasphere roadmap & design notes

A record of decisions and *why*, so future work doesn't re-derive them. Not a
spec to build against literally. Update as things change.

## Philosophy

- MTG-first, and effectively MTG-only. Nothing generic is built for games that
  don't exist; a second TCG would be a fork, not a configuration.
- Personal/hobby scope: one user first, a handful of friends is the realistic
  ceiling.
- Design carefully where mistakes are expensive (lexicon NSIDs, required
  fields — permanent once records exist in other people's PDSes); move fast
  where they're cheap (our DB is a disposable index).

## Running costs

Cost per user is very low: the client does search and scanning, the PDS holds
the data, and the fixed Scryfall sync dominates. This may never need funding.

If it does, donations first, ads only if genuinely necessary, self-hosting free
regardless. Both are permitted by the policies below. Not a business.

## Licensing

- **AGPL-3.0-only** for the AppView — server, web UI, the running service.
- **MIT** for `lexicons/`. NSID schemas are shared vocabulary and the point is
  other people adopting them; copyleft on a schema file discourages exactly
  that. Same argument, weaker, for `crates/core`.
- Per-crate `license` fields in each `Cargo.toml` carry the split. GitHub only
  detects the root LICENSE, so the README explains it.
- Why AGPL rather than MIT/Apache like the rest of atproto: loosening a licence
  later is trivial, tightening one forks projects (HashiCorp → OpenTofu, Redis
  → Valkey). Permissive would permanently foreclose a hosted option.
- Contributions take a DCO (`Signed-off-by`, via `git commit -s`), not a CLA.
  That does *not* preserve the right to relicense unilaterally, and the
  decision becomes irreversible at the first outside PR.

## IP constraints

Two policies bind what can be built, whether or not money is involved.

**WotC Fan Content Policy.** Selling Wizards-related content needs their
permission, and you "can't require payments, surveys, downloads, subscriptions,
or email registration to access your Fan Content". Donations and ad revenue are
explicitly permitted. The disclaimer must be carried verbatim wherever the
project is named: unofficial Fan Content permitted under the Fan Content
Policy, not approved/endorsed by Wizards, portions of the materials used are
property of Wizards of the Coast, ©Wizards of the Coast LLC. The policy doesn't
address software; an older Fan Site Policy is read by some as barring apps
outright, which sits awkwardly against the many MTG apps nobody has bothered.
Unresolved, not permission.

**Scryfall API terms**, enforced by blocking API access:

- No paywalling their data — no payment, subscription, survey or channel-follow
  in exchange for access. With accounts, users must still reach card data
  anonymously or free.
- No repackaging, republishing or proxying. Our software must add value.
- Image rules bind the UI: don't crop or cover the copyright or artist name,
  don't distort or recolour, no watermarks, and `art_crop` needs artist and
  copyright shown in the same interface.
- Don't imply Scryfall endorsement.

**EDHREC** is stricter again — personal noncommercial use, no automated
queries. See Phase 4.

The line all three draw: card data stays freely reachable, and anything gated
must be our own compute rather than access to someone else's data.

## Data model — owned vs referenced

Everything hangs off one question: do these cards physically exist in your
possession, or are they a reference?

- **Container** — a named physical place: binder, box, deck box. A record with
  a name and a kind.
- **Collection entry** — a card you own, in exactly one container. Carries
  `scryfall_id`, finish, condition, quantity.
- **Design** — card references you may or may not own. A *deck* is a design
  with deck metadata (format, commander, sideboard); a *list* is one without
  (wishlist, trade pile). Same entry shape, different parent.

"Design vs built" for decks and "collection vs list" for cards are one axis
asked twice, so they share a mechanism rather than becoming four concepts.

**"Built" is derived, never stored.** A deck is built to the extent its design
entries are matched by collection entries in that deck's container. Partial
builds come free, the gap is both a shopping list and a valuation, and
conflicts surface on their own: if two decks want your only Sol Ring, the card
is in one container and the gap shows it. A stored flag would drift the moment
you rob a deck for parts.

**Cards in a deck box are still yours.** Owned valuation sums collection
entries wherever they live. Moving a card changes its container, not ownership.

Consequences:

- One record per collection stack, deck contents embedded as an array in the
  deck record. A 10k-card collection can't be one record; a 100-card deck
  shouldn't be 100.
- Design entries: `oracle_id` required, `scryfall_id` and `finish` optional.
  Omitting the print means "any printing". Carrying both ids keeps the record
  interpretable without a Scryfall index, which matters for a record other
  AppViews may read.
- **Design entries are keyed `(oracle_id, scryfall_id?, finish?)`**, so diffs
  and fork provenance have stable identity rather than array positions. The key
  also handles two entries for one card intended as different printings.
- **Owned cards are keyed differently**: `(scryfall_id, finish, condition)`
  within a container. No `language`: every language of a printing has its own
  Scryfall id (m10 #146 has nine), so the field could only contradict it.
- The keys share no fields, and owned cards carry no `oracle_id`, so matching a
  design entry to owned cards routes through the card cache to resolve
  `scryfall_id → oracle_id`. That join is the heart of the design-vs-built
  diff, and it isn't free.
- Proxies and borrowed cards are the untidy edge. Deferred; an optional flag on
  the collection entry if it matters.

## Interface — one model, separate views

The model makes decks, binders and lists the same thing. The UI should hide it.

- **Collection view** answers "where is my Sol Ring?" — every copy owned,
  grouped by container, naming the deck where the container is a deck box.
  That's why a deck references its container.
- **Deck view** shows only designs carrying deck metadata; lists get their own
  view. Filtering on kind is the entire mechanism.
- Containers are an **opt-in organisational layer**. Default to a single
  "Collection" so someone who doesn't care where a card lives never has to
  answer. Location tracking for those who want it, not a tax on those who
  don't.

### Deck state

`archived` is the only stored state — GitHub-style, drops a deck out of the
default list, reversible. "I've stopped caring about this" isn't derivable from
anything else.

Everything else is observation on two independent axes: **design completeness**
(entries against the format's target) and **build completeness** (how much of
the design you have).

Build completeness is **scoped by whether the deck has a container**, which
needs no setting of its own:

- **With a container** it asks "is this deck built?" — how much of the design
  is physically in that deck box. Precise, and it makes competing decks
  visible, since a card lives in one container.
- **Without one** it asks "could I build this?" — do you own enough copies
  anywhere. That's the answer for anyone who never opted into container
  tracking, and it's the same question ManaBox answers.

The trade is that ownership scope loses conflict detection: own one Sol Ring
and two decks both read as satisfied, because nothing allocates it. Acceptable,
and the same trade every collection tracker makes. The four diff states below
work either way — only the candidate pool changes.

"WIP" is a label the UI puts on a range of those numbers, not a state anyone
sets. A half-designed deck with nothing sleeved is (78%, 0%); a finished design
you haven't built is (100%, 0%).

### Design vs built diff

The intended-print-versus-reality view is a feature in itself: you designed
around a Necron Darkness, you have an ordinary one sleeved, and the app should
say so rather than calling the slot filled. Per design entry:

- **Satisfied** — intended print and finish present.
- **Print mismatch** — right card, wrong printing. The upgrade list.
- **Finish mismatch** — right print, nonfoil standing in for foil.
- **Missing** — nothing fills the slot. The buy list.

Plus **extras**: cards in the container that aren't in the design.

Missing plus mismatches *is* the shopping list, so a per-deck wishlist needs no
maintaining. Only entries with a deliberate print intent can mismatch, which is
what keeps "any printing" designs quiet.

### Scanning

Scanning goes to a **staging list**, not straight to a destination. Scan
freely, then decide at commit: discard it (you were checking prices), or send
the batch to a container, deck or list. Provenance — new cards versus from
collection — is chosen per batch at that point. Fewer decisions than choosing a
mode upfront, and it makes price-checking first-class rather than an abuse of
the import flow.

Destinations: a container; a deck from collection (owned cards move into its
container); a deck as new (added to owned totals *and* placed); or a design
only, with no collection entry created.

**Source reconciliation.** Committing into a deck means saying where each card
came from. One row per card with a source selector, kept cheap:

- Prefill, don't interrogate. One plausible source fills silently; several fill
  the likeliest and allow a change. A hundred dropdowns demanding attention is
  worse than ManaBox today.
- Bulk actions primary, per-card the escape hatch. Batches are homogeneous.
- Sort by whether a row needs attention, so a hundred-card batch with three
  problems shows three things.
- The selector picks a **stack**, not a container — the same print in two
  conditions is two stacks, so options read "Binder A — NM, nonfoil".
- Scanning more copies than you own is normal with playsets. Scan four, own
  one, default to one-from-collection plus three-new and say so.

Because entries are stacks rather than individual cards, moving one copy is a
decrement on the source and an increment on the destination, not a pointer
update. Moving a whole deck is ~200 writes; batch through `applyWrites`.

## History, snapshots and forking

Three needs, three mechanisms. Conflating them is where this goes wrong.

### Undo — client only

Stack in IndexedDB, kept for a meaningful window. Never goes to the network:
cross-device undo isn't an interaction anyone wants.

**Undo applies the inverse to current state; it never writes an old state
back.** Deck holds A, B, C. Phone adds D, laptop (unsynced) adds E. Undo by
state-restoration writes {A,B,C} and destroys E. Undo by inverse computes
current-minus-D and E survives. Pair with `swapRecord` so a genuine race fails
loudly.

### Recent changes — bounded tail in the deck record

Not an undo buffer. Its job is looking back over the last handful of changes,
across devices, and *then* naming one as a snapshot. That works because the
diffs are invertible: current state plus N inverse diffs reconstructs any of
the last N states, so "that version was good" is reachable retrospectively.

- A diff is ~100-200 bytes. Ten is 1-2KB, fifty is 5-10KB, against a deck
  record of ~6-8KB for 100 cards.
- No hard wall, just write bandwidth: the whole record is rewritten per edit.
- **The bound is client policy, not schema.** Raising 10 to 50 needs no lexicon
  change, so starting conservative costs nothing.
- Bound by count, not time — nothing prunes a record until its next write, so a
  time limit leaves stale entries for months and buys nothing.

### Named snapshots

A "save version" button writing a separate record: named, unbounded, complete.
The only thing that delivers restore, since a bounded tail can't reach past its
window. A 100-card list is 5-10KB, so a dozen per deck is nothing.

**Restore auto-snapshots current state**, so restoring is itself undoable.

### History tab

One merged timeline: named snapshots and states reconstructed from the tail,
both restorable, visually distinguished. Tail entries age out as they fall off
the window — say so, since that's the prompt that gets someone to name one.

### Forking

A fork is a new deck copied from a source, either current state or a named
snapshot. Branch-versus-copy is **one optional field**, not a history copy:

- **Fork** records `forkedFrom` (at-uri + cid, plus snapshot name if any). The
  UI can show provenance, diff against the parent, list siblings.
- **Copy** records nothing. An independent deck starting from the same list.

Lineage is a pointer, not a duplicate, the way a git fork shares history rather
than copying it. A dangling pointer degrades to "forked from a deck that no
longer exists".

Forking someone else's published deck is the same mechanism with the at-uri
pointing at their record, so it wants designing alongside Explore.

### Activity feed

Derived from the firehose once Phase 3 exists, with no extra records and no
dependence on the in-record tail. Feeds are recent-biased, so losing old
activity to a rebuild is acceptable here in a way it wouldn't be for snapshots.

## Local-first: who writes what

**The browser writes directly to the user's PDS** with its own OAuth session —
a public client using PKCE and DPoP, `client_id` being the URL of a static
client metadata document we serve. Our server never proxies a write.

- **No token state on the server.** Access, refresh and DPoP keys live in the
  browser, so they're not ours to lose. Store the DPoP key as a non-extractable
  `CryptoKey` and mean the CSP, because XSS becomes token compromise.
- **rkeys are ordinary TIDs.** Deterministic rkeys only helped a stateless
  server that had to find a record without a lookup; a local-first client holds
  its own stack-key → rkey index. It also dodges an ugly choice: a
  deterministic key including the container makes moving a card a
  delete-plus-create, and excluding it stops a stack existing in two
  containers.
- **Read-your-own-writes falls out.** A write would otherwise travel browser →
  PDS → firehose → index before any server-backed view saw it. The client keeps
  its own materialised view in IndexedDB, reading records from its own PDS with
  `listRecords` on first load.
- **The PDS is the device-sync mechanism.** Device B reads what device A wrote,
  with nothing of ours in between.
- Offline writes need a queue. `client_id` is tied to the deployment domain, so
  dev and prod need different ones; there's a localhost allowance worth
  checking before relying on it.

**So v0 needs no firehose consumer and no query API.** The AppView serves the
catalog, the app and the client metadata document, and runs the weekly Scryfall
sync. Indexing earns its place at Phase 3.

## Storage: why SQL

Document storage is atproto's job — PDSes hold the records. Ours is an *index
over* them, and indexes want to be relational. We're choosing a store for
queries, not documents, and the queries are joins, aggregates and point lookups
with secondary indexes. An embedded KV store means hand-rolling every index
with no query language; a document server contradicts the single-process
decision.

Two SQLite specifics earn their keep. **FTS5** gives full-text card name search
free, which is the server-side fallback a client-only design otherwise lacks.
**JSON columns with indexed generated columns** handle the semi-structured
part: `card_faces` is irregular, so store it as JSON and generate columns for
what's queried. An unexpected Scryfall shape then doesn't silently null a
column.

Keeping whole card objects would put the bulk file's uncompressed bulk on a
small VPS disk — and several gigabytes of it if All Cards ever lands. Shred
what's queried, keep `card_faces` as JSON, discard the rest.

Measured on 2026-09-07: 117,630 printings shred to a 94MB file including the
FTS5 index, written in about 4 seconds. Legalities are the one column worth
normalising — Scryfall repeats ~480 bytes on every printing and only 611
distinct combinations exist, so inline they were 47% of the database. The sync
truncates the WAL when it commits, which otherwise sits at roughly the size of
the database again.

## Domains: three, not one

Three concerns that don't need the same domain, and conflating them is what
makes migration look frightening:

- **NSID root** — `app.manasphere.*`, from `manasphere.app`. Reverse-DNS,
  permanent, embedded in every record ever written, and it needs DNS control
  rather than hosting. Registered, so this is settled: after the first record
  exists it can't change without a per-user migration.
- **App hosting** — `manasphere.app`. Freely changeable, unlike the NSID root
  that shares its name.
- **PDS** — a separate domain, deliberately. atproto's production guide wants
  the PDS and the app on different registrable domains, since blobs served from
  the PDS would otherwise share an origin with the app's OAuth and session
  pages. Changing a PDS hostname once it has accounts is also genuinely hard
  (per-account PLC rotation), so it wants settling early and leaving alone.

OAuth `client_id` follows app hosting, so moving domains costs users one
re-authorisation. Unrelated to NSIDs.

## If atproto goes away

Not building this now, but the seams cost nothing and are decent design anyway.
Standalone mode is a *smaller* system: if the server owns the data the firehose
disappears rather than needing a replacement, and OAuth becomes session auth.
The risk isn't build effort later, it's atproto concepts leaking where they
don't belong.

- **`crates/core` compiles with no atproto dependency.** Domain types carry
  `scryfall_id`, quantity, finish, not at-uris and CIDs.
- **Identity is an opaque internal id**, with DID as one mapping in a `users`
  table, rather than DIDs through the schema.
- **Indexing is a function, not a pipeline.** Write it as "given a record and
  its metadata, upsert" so a direct write can call it, not only Jetstream.
- **The client needs the same seam**, since it holds the write path. It needs a
  data-access layer anyway to handle reads-from-AppView alongside
  writes-to-PDS.
- **Don't contort the lexicons for it.** `forkedFrom` as an at-uri is correct
  in atproto; a standalone adapter can map it.

Eventually an installation flag, suiting the single-binary deploy. Standalone
loses portability and everything social, so it's a lifeboat, not a goal — worth
launching only if atproto turns sharply for the worse. Browser-writes raises
the transfer cost slightly, since the write path would move back to the server.

## Server load & scaling

With search, scanning and import/export client-side, almost nothing is
per-user; fixed periodic jobs dominate. In v0 the AppView doesn't even watch
the firehose. Per-user cost is a few index rows and a trickle of events —
nobody edits a collection thousands of times a day. What scales is bandwidth
for static artifacts, which a CDN fixes cheaply.

Sizing below is **estimates, not measurements**. Two UUIDs alone account for
72 bytes of the per-printing figure; measure before relying on any of it.

- Trimmed catalog: perhaps 120-150 bytes per printing over ~100k English
  printings, so ~15MB raw and 4-5MB gzipped.
- Scanner index: maybe under 1MB for perceptual hashes, ~25MB for embeddings.
- Weekly deltas have no mechanism yet — computing them means keeping a previous
  catalog snapshot server-side, which sits awkwardly with a disposable DB.

| Users | Shape |
|---|---|
| 1-5 | Box is idle. Cost is the fixed sync jobs. Current VPS is oversized. |
| 50 | Still idle. ~2-5GB/month transfer. Nothing per-user held in RAM. |
| 500 | 15-50GB/month, inside the 1-2TB included. DB 1-2GB. Still 1 vCPU. |
| 5000+ | Bandwidth first, solved by a CDN. Process shape doesn't change. |

Two hazards, both memory-shaped on a 1GB box: the bulk sync must stream JSONL
line by line, and the scanner index build must not run on the VPS at all.

What would break flat costs, likeliest first: a server-side scanner fallback,
Explore's network-wide indexing, then price history's unbounded storage.

## Open questions

**Design-vs-built is an assignment problem.** Entries carry quantities, so
states are per copy rather than per entry, and an "any printing" entry competes
with a print-bound one for the same stack. Greedy matching gives different
answers by iteration order. Needs a defined resolution order: print-bound
first, then any-printing, extras as the complement.

**Container references.** How an entry points at its container, and what
happens to entries when a container is deleted, is unspecified.

**PDS write limits.** A 10k-card collection is thousands of records.
`applyWrites` is capped per call and accounts are rate-limited, so a large
import may take hours and needs resumability. Verify against the target PDS —
it may be the argument for coarser records.

**Serialised cards.** A serialised card is individually numbered, so it is
finer-grained than a printing and two copies are not interchangeable. The model
keys on printing plus quantity and cannot tell them apart. An optional serial
field on the card record covers it and is additive, so it can wait — but the
shape wants deciding when there is an import path that carries one, rather than
guessed at now.

**Scryfall id migrations.** Scryfall merges and retires printing ids, and
records in other people's PDSes reference them permanently. Scryfall publishes
migrations; consuming them is small work but unplanned.

**Backfill.** Handled for a user's own data by reading their own PDS. Returns
as a real problem at Phase 3, where the index needs other people's records that
predate our subscription.

**Jetstream is unauthenticated.** It doesn't verify signatures. Fine for our
own DIDs; a real trust assumption once Explore indexes arbitrary users.

**Oracle properties are duplicated per printing.** `oracle_text` is 16MB across
117,630 rows but only ~31,000 oracle ids, and `type_line`, `keywords` and `cmc`
repeat the same way. Splitting an oracle table from the print table is both the
right model and roughly 4x smaller, but it wants doing alongside the client
catalogue subset rather than guessed at before it.

**What manual search surfaces.** The cache holds digital-only printings, tokens
and art series, and name search currently returns all of them — a search for
"lightning bolt" leads with art cards. Needs a filter, and a decision about
what belongs in the client artifact.

## Phase 0 — Collection tracking (current focus)

- Manual search + CSV import only. No scanner, no live pricing.
- Card cache from **Default Cards** (~78MB compressed), and the client resolves
  anything missing from it directly against Scryfall's API. Their CORS policy
  is `access-control-allow-origin: *` with a 48-hour `cache-control`, so a
  browser can fetch a single printing and cache it in IndexedDB permanently.
  Each exotic card is fetched once per device, ever.
- That means **All Cards (~392MB) isn't needed server-side for v0**. Default
  Cards omits most non-English printings, which was the argument for the big
  file; on-demand client resolution covers them instead, and the server DB
  stays small. All Cards may return at Phase 3, when the AppView indexes other
  people's records and has to resolve arbitrary printings itself.
- **Don't push catalog load onto Scryfall wholesale.** Per-keystroke search
  against their API would be externalising our load onto a free service that
  publishes bulk files specifically so apps don't do that — and it's our API
  access that gets restricted. Serving a trimmed 4-5MB artifact ourselves is
  cheaper for everyone, and it's static, so a CDN makes it near-free.
- The client gets English gameplay data plus a name index for the languages
  that user owns. Non-English printings mostly share gameplay data with
  English; what differs is name, type line, oracle text and image.
- Bulk files are **gzipped JSONL**, one card per line, served as
  `application/gzip` with an ETag and `accept-ranges`. Stream line by line;
  parsing whole will OOM a 1GB box. The index entry gives
  `jsonl_download_uri` and `compressed_size` — the older `download_uri` /
  `content_encoding` pair is gone.
- **Card objects aren't uniformly shaped, and this bites on the first sync.**
  `layout: reversible_card` (81 printings) has no top-level `oracle_id`, `cmc`,
  `mana_cost`, `type_line`, `oracle_text`, `colors` or `image_uris` — all on
  `card_faces`. Transform layouts have null top-level `mana_cost` and
  face-level images. So `oracle_id` cannot be `NOT NULL`, and the cache needs
  `layout` and `card_faces`.
- **Taxonomies grow without notice**, so `layout`, `rarity`, `set_type`,
  `finishes`, `games` and `legalities` stay strings in the parse layer. A
  weekly unattended sync shouldn't fail on a new value, and two undocumented
  layouts (`front_card`, `prepare`) turned up on the first real run. Colours
  are the exception: the game's rules close that set.
- Measured on 2026-09-07: 117,630 printings, streamed and parsed in 2.4s. The
  parse is not the expensive part of a refresh.
- The bulk files include digital-only printings, tokens and art series. Decide
  what manual search surfaces before shipping the catalog, or users get Alchemy
  rebalances in their results.
- Refresh weekly — Scryfall says gameplay data needs fetching "once per week or
  right after set releases". The API also requires an accurate `User-Agent`
  naming the app (`Manasphere/0.1`), explicitly not a library default.
- Don't ship image URIs; they derive from the card id as
  `cards.scryfall.io/{size}/front/{id[0]}/{id[1]}/{id}.jpg`, the query string
  being a cache-buster. Keep `image_status` — `missing`/`placeholder` printings
  have nothing behind that URL. Back faces use `/back/`, and `png` ends `.png`.
- Import/export is client-side and costs us nothing. ManaBox CSV both ways
  first, since it's the likeliest source of an existing collection, then
  Moxfield, Archidekt, Deckbox and a plain `scryfall_id`+quantity shape. Being
  easy to leave is the data-ownership pitch made concrete.
- PWA + service worker: cache the trimmed catalog in IndexedDB so manual search
  is client-side, not a round-trip per keystroke. Biggest lever for keeping the
  server light.

## Phase 1 — Scanner

**Client-side inference.** Recognition runs in the browser (WASM) against a
precomputed index shipped with the catalog. No server in the per-scan path,
works offline, nothing leaves the device.

**Beat ManaBox on printing identification.** ManaBox matches art only, so the
user picks set and finish by hand every time. Exact printing ID is the feature
worth switching for.

- Constrain, don't classify. Art match narrows to the printings sharing that
  art; set symbol and collector number pick among those, which is a handful-way
  decision rather than 900-way classification.
- Collector number is the strongest signal. On modern frames the bottom line
  carries number, set code and rarity in a known font with a tiny alphabet, so
  a small purpose-trained model beats general OCR at a few hundred KB rather
  than Tesseract's ten-plus MB. Set code plus collector number identifies a
  printing outright.
- Foil is glyph classification, not computer vision. The premium indicator sits
  between set code and language on that same line: `BLB • EN` nonfoil,
  `BLB ★ EN` foil. Traditional foils share collector numbers with nonfoils, so
  this marker is the only differentiator.
- Era caveats: the M15 frame (2015+) puts it there; the Exodus frame
  (1998-2014) put a star next to the collector number. Older cards have no
  collector line, but foils didn't exist before Urza's Legacy (1999), so
  absence is itself a reliable nonfoil signal.
- Usually it doesn't arise — `finishes` narrows most pinned printings to one
  possibility.
- Proxies and alters defeat any scanner and always will. Accepted limitation.

**The index is a build-time artifact, not a runtime service.** Building it
means pulling ~100k images (~10GB) and hashing them, which is hours on 1 vCPU.
Build locally, publish the artifact, serve it statically, same as `web/dist`.
Incremental per-set rebuilds (~300 cards) are fine on the box. Throttle the
initial pull: hammering Scryfall's CDN is the "repeated mishandling" that gets
API access restricted.

Client-side inference also removes the compute cost that would have been the
one meterable feature, and selling the index itself is both policy-murky and
unenforceable under AGPL. If a paid tier is ever wanted it's the server-side
fallback for cases client inference fails on — foil glare, poor lighting,
damage, non-English printings — plus bulk scanning from uploaded photos.

## Phase 2 — Valuation

- Price cache table, separate from the card cache, keyed `scryfall_id` +
  source + timestamp.
- **There is no prices bulk file.** The seven bulk types are `oracle_cards`,
  `unique_artwork`, `default_cards`, `all_cards`, `rulings`, `art_tags` and
  `oracle_tags`; prices exist only as fields inside card objects. So a faster
  cadence has no cheap mechanism: it means re-pulling the whole file, or
  ~100k per-card API calls at 10/s. The separate table is still right; the
  decoupled refresh was wishful. Decide the real cadence when Phase 2 starts.
- **Scryfall prices can't fund a paid tier.** They come from Scryfall's
  affiliates, the no-paywall clause covers them, and their own guidance is that
  prices are "dangerously stale after 24 hours", for trends and estimates only,
  "not updated frequently enough to power a storefront".
- If valuation is ever sold, re-source it — TCGplayer and Cardmarket run
  affiliate programmes with commercial terms. Otherwise keep it free.
- Valuation is collection entries × latest cached price. No new architecture.

## Phase 3 — Decks

- **This is where Jetstream arrives.** Explore needs indexing across users,
  the first thing a local-first client genuinely can't do for itself.
  Subscribe with `wantedCollections` scoped to our own NSIDs, network-wide —
  cheap, since only Manasphere users emit matching events.
- Deck records live in the owner's PDS, same single-owner model as collection
  entries.
- A deck is a design with deck metadata and an **optional** container
  reference, created the first time it's physically built, so pure concepts
  don't litter the model with empty containers.
- Three ways to add a card, one schema: bind to a print you own (default), pick
  one deliberately for flavour, or omit it for "any printing". Legality
  checking and recommendations key on `oracle_id`, which every entry carries.
- **Visibility flag on the record**, for decks, lists and collections:
  `visibility: "unlisted" | "published"`. Not access control — atproto records
  are publicly fetchable regardless. It only controls whether our AppView
  mirrors the record into Explore and whether our UI surfaces it. See Sharing.
- Genuinely *collaborative* multi-owner decks are harder — atproto has no
  multi-writer record. The standard pattern is one canonical owner record plus
  member-contributed records aggregated by the AppView, as Bluesky Lists do.
  Deferred; not needed for solo publishing.

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
knows the DID, which makes a collection an itemised, valued inventory of
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
unencrypted and readable by every authorised member and the host. Spaces gets
you "my friends can see this, strangers can't", never "nobody can". Probably
the right level for a collection, but say it accurately.

Designing toward it costs nothing now, since our server never reads a user's
collection in v0. Just don't build anything that *depends* on collection
records being publicly readable.

## Phase 4 — Recommendations

**Ingesting EDHREC is not permitted.** Their Terms of Use (Aug 2024, Space Cow
Media) grant access "solely for your own personal, noncommercial use", prohibit
derivative works, and bar using "software or automated agents or scripts to
generate automated searches, requests, or queries to the Site". The keyless
`json.edhrec.com` is still their infrastructure, and leaning on a gap between
it and "the Site" would be lawyering around plain intent. Their robots.txt is
permissive about crawling, but robots.txt isn't a licence.

**Link out instead.** A link a human clicks is the user's own browser doing
what their personal-use licence contemplates, so card pages and search URLs are
equally fine. What's barred is *our code* fetching either: no prefetch, no
server-side fetch for preview cards, no iframes. Asking them directly is also a
real option; small MTG projects do get informal arrangements.

**Our own recommendations, aimed elsewhere.** The hard part isn't the model,
it's the corpus: co-occurrence data means our users' decks (empty until Explore
has scale) or someone's scrape, and anything sourced from EDHREC taints the
model too.

- Most practical value needs no deck corpus. Type lines, mana costs, colour
  identity, oracle keywords and combo detection are computable from Scryfall
  data we already hold.
- That buys what EDHREC structurally can't do: **recommendations constrained to
  cards you own.** "Your commander cares about artifacts, here are eleven in
  your binders" is a different product, not a worse copy — no cold start,
  licence-clean, landing on the collection index we already have.
- Same build shape as the scanner index: precompute offline, ship the artifact,
  serve it statically.
- Co-occurrence is a later enhancement, once Explore provides a corpus of our
  own.

## Phase 5 — Game toolkit (life totals, dice, game history)

- **Architecturally separate** from the collection/deck model. Don't tangle it.
- Live game state is high-frequency and ephemeral, a bad fit for PDS records —
  no network write per point of damage. Keep it client-side during play, with
  peer-to-peer sync between devices for a shared table view if needed.
- Persist only an optional *summary* record at game end (final life totals,
  winner, deck used, date).
- Own lexicon namespace, `app.manasphere.game.*` — "game" here means a game
  being played, not which TCG. Kept apart from collection and deck lexicons.

## Multi-TCG (deferred, maybe never)

If it ever happens, it's a **fork, not a namespace**: pull the genuinely shared
parts into libraries and build a separate app with its own NSID root. The
domain models barely overlap — no colour identity in Pokémon, different
legality rules, different recognition problem — so one namespace tree
straddling both would couple things that want to stay apart.

Trading is explicitly **out of scope** either way. This is a
personal-collection tool, not a marketplace.

## Lexicon notes

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
- Merging two collections later should be done by normalising at the AppView
  ingest boundary — keep reading both NSIDs, map to one internal
  representation — rather than migrating PDS records, which needs a per-user
  opt-in flow. That's also the escape hatch if the NSID root ever has to move.

## References

- [WotC Fan Content Policy](https://company.wizards.com/en/legal/fancontentpolicy)
- [Scryfall API docs](https://scryfall.com/docs/api) — data/image use rules
- [Scryfall bulk data](https://scryfall.com/docs/api/bulk-data)
- [Scryfall Terms of Service](https://scryfall.com/docs/terms)
- [EDHREC Terms of Use](https://edhrec.com/terms) — no automated queries,
  personal noncommercial use only
- [MTG Wiki: information below the text box](https://mtg.wiki/page/Information_below_the_text_box)
  — premium indicator, set code, collector number layout
- [atproto Spaces alpha](https://atproto.com/blog/atproto-spaces-alpha) —
  access control, not confidentiality; alpha as of Aug 2026
- [atproto going to production](https://atproto.com/guides/going-to-production)
  — PDS and app want separate domains
