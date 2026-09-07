# Scryfall

Card data comes from Scryfall, and its shape drives most of the cache. Their
terms are in [`ip.md`](ip.md).

## Bulk data and the cache

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

## Serialised cards are a printing, not a copy

Scryfall models the printing and stops there. A serialised card carries
`serialized` in `promo_types` — 299 printings across 20 sets, collector numbers
ending `z`, and `is:serialized` filters them. The Lord of the Rings 1-of-1 One
Ring is collector number `0`.

**Neither the print-run size nor the individual number exists anywhere in
Scryfall.** So "042/500" is data we hold with nothing to validate it against.
An optional `serial` string on `app.manasphere.card` covers it, with quantity 1
whenever it's set, since numbered copies aren't interchangeable. Additive, so
it can wait for an import path that carries one.

## Scryfall id migrations are smaller than they look

2,581 migrations exist: 2,354 deletes and 227 merges. A merge gives
`new_scryfall_id`, so it's a remap; a delete gives no replacement.

Most are corrections of printings that never existed — 1,043 "Localized version
doesn't actually exist", 532 phantom Portuguese CMM cards, 404 "Mistakenly
imported" — which nobody can have owned. The rate has collapsed too: 1,270 in
2023 against 65 so far in 2026.

Consume them weekly alongside the bulk sync. Remap merges silently; surface
deletes, because 471 carry no metadata and an orphaned reference to one of
those can't be interpreted at all. The rest preserve name, set, collector
number and oracle id, so an orphan usually stays readable.

## What other trackers actually export

Sample CSVs from five tools, since these are the import targets and their
columns are the evidence for what a collection row needs.

| | container | trade qty | tags | notes | serial | price paid | date bought |
|---|---|---|---|---|---|---|---|
| ManaBox | Binder Name + Type | — | — | — | — | yes | — |
| Moxfield | — | yes | yes | — | — | yes | — |
| Dragon Shield | Folder Name | yes | — | — | — | yes | yes |
| MTGGoldfish | — | — | — | — | — | — | — |
| TCGplayer | — | — | — | — | — | — | — |

**No tracker records a serial number**, which settles the serialised question:
treat it as the promo printing it is. Scryfall lists `serialized` alongside
`boosterfun` and `doublerainbow`, and a dedicated field's key invariant —
quantity 1 — can't be expressed in a lexicon anyway, so it would be a
client-side rule other implementers break.

Two columns we would silently drop, both worth settling before import ships:

- **Price paid**, in three of five, and Dragon Shield adds date bought. That is
  collection data rather than market data, so it is not the Phase 2 price
  cache.
- **Trade quantity**, in two of five. Our model says that's a trade list, which
  is better, but the column has nowhere to land on import.

ManaBox's Binder Name and Type map onto containers, and Dragon Shield's Date
Bought onto `acquiredAt`, so both of those fields are carrying weight.

## Open questions

**Price paid, and trade quantity.** Both appear in trackers we import from and
have nowhere to land. See the comparison above.

**Oracle properties are duplicated per printing.** `oracle_text` is 16MB across
117,630 rows but only ~31,000 oracle ids, and `type_line`, `keywords` and `cmc`
repeat the same way. Splitting an oracle table from the print table is both the
right model and roughly 4x smaller, but it wants doing alongside the client
catalogue subset rather than guessed at before it.

**What manual search surfaces.** The cache holds digital-only printings, tokens
and art series, and name search currently returns all of them — a search for
"lightning bolt" leads with art cards. Needs a filter, and a decision about
what belongs in the client artifact.

## References

- [Scryfall API docs](https://scryfall.com/docs/api) — data/image use rules
- [Scryfall bulk data](https://scryfall.com/docs/api/bulk-data)
- [Scryfall migrations](https://api.scryfall.com/migrations) — retired and
  merged printing ids
- [MTG Wiki: information below the text box](https://mtg.wiki/page/Information_below_the_text_box)
  — premium indicator, set code, collector number layout
