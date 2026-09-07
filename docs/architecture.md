# Architecture

What runs where, and why the AppView owns so little.

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

- PWA + service worker: cache the trimmed catalog in IndexedDB so manual search
  is client-side, not a round-trip per keystroke. Biggest lever for keeping the
  server light.

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

## Open questions

**Jetstream is unauthenticated.** It doesn't verify signatures. Fine for our
own DIDs; a real trust assumption once Explore indexes arbitrary users.
