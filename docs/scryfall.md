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
  against their API would be externalizing our load onto a free service that
  publishes bulk files specifically so apps don't do that — and it's our API
  access that gets restricted. Serving a trimmed 4-5MB artifact ourselves is
  cheaper for everyone, and it's static, so a CDN makes it near-free.
- The client gets a subset of the cache, not all of it — what, and what it
  weighs, is settled below.
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
  layouts (`front_card`, `prepare`) turned up on the first real run. Colors
  are the exception: the game's rules close that set.
- Measured on 2026-09-07: 117,630 printings, streamed and parsed in 2.4s. The
  parse is not the expensive part of a refresh.
- The bulk files include digital-only printings, tokens and art series. Which
  of those search surfaces is settled below; the cache keeps all of them,
  since a printing you can own has to be findable.
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

## Serialized cards are a printing, not a copy

Scryfall models the printing and stops there. A serialized card carries
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

**No tracker records a serial number**, which settles the serialized question:
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
Bought onto an acquisition's `at`. `note` and `tags` between them give
serialized numbers, misprints, alters and provenance a home without a typed
field each.

### What you paid is not what it was worth

ManaBox's `Purchase price` holds two different things. Left alone it fills in
the market price at the moment you add a card, so a column named for what you
paid is often just a snapshot, and afterwards the two are indistinguishable.
That makes its profit-and-loss really "market drift since I added it" wearing
a P&L label.

Measured across a real 3,743-row export: 251 identity keys repeat, 216 of them
differing only in price, and the recorded figures track market value — median
ratio to current price 0.67, quartiles 0.37 and 1.20, with only 26% landing on
a 5p boundary against the ~20% chance alone would give. Hand-typed prices
would cluster on round numbers and sit far below market for bulk. These are
snapshots taken on different days.

So an acquisition carries both, named for what they are: `price` is what you
paid and is absent when you didn't say, `marketValue` is what a copy was worth
at the time. Both are decimal strings, because money is not a float, and both
carry their own currency — Scryfall quotes USD and EUR, and you may well have
paid in neither. `marketValue` has to be stored rather than derived later,
since Scryfall publishes no price history and no prices bulk file.

Two honest figures come out of that instead of one false one: what you paid
against what it is worth now, over the cards where cost is known and showing
that coverage, and drift since acquisition, which works everywhere because we
snapshot it.

**A ManaBox import writes `marketValue`, not `price`.** We cannot tell an
edited row from an auto-filled one, and the costs are not symmetrical: putting
an unpaid amount in `price` produces a confident lie in every comparison
afterwards, where the reverse produces a gap. People who diligently edited
theirs get an opt-in.

Neither ManaBox nor MTGGoldfish nor TCGplayer exports any date, so an import
leaves `createdAt` at import time rather than when the card was really added.
Moxfield's `Last Modified` seeds `updatedAt`.

## Oracle and printing are two tables

Which fields belong to a card rather than a printing was measured, not
guessed: group all 117,630 printings by `oracle_id` and count the columns that
disagree. Six never do — `color_identity`, `defense`, `edhrec_rank`,
`game_changer`, `keywords`, `reserved`. Ten more disagree for 71 cards out of
38,633, and every one of those 71 is a reversible printing sharing an id with
a normal one, whose nulls are the whole disagreement.

So `name`, `type_line`, `mana_cost`, `cmc`, `oracle_text`, `colors`, `power`,
`toughness`, `loyalty` and `defense` are card-level. `legalities` is not: 2% of
cards have printings that disagree, because a gold-bordered reprint is legal
nowhere. Neither is `layout` — a card printed both normally and reversibly has
two shapes, and that is a fact about the objects.

**The split repairs reversible printings rather than merely deduplicating
them.** They carry no top-level gameplay data at all, so there was nowhere for
it to come from; the card's row is filled from the best-ranked printing and any
field still missing from whichever printing has it. All 81 now resolve to a
card with a type line.

Best-ranked is not first-seen: 8 cards have a reversible printing as their
best, so a printing arriving later can displace what earlier ones established.
The two merge either way round rather than the later one starting over, or the
file's order would decide what a card's type line is.

Measured: the database goes from 94MB to 81MB, and the client's gameplay
payload from 20.3MB to 7.5MB — the artifact is the real prize, being the
difference between hitting a 4-5MB target and missing it.

`kind`, `paper`, `printings` and `default_print` are derived onto the card row
at sync time, so search needs no window functions and no `bm25` gymnastics.
`printings` counts paper only, being what a collector could own.

## What the client artifact holds

Two files under one version. Positional rows with their column names in a
header, written uncompressed for a CDN to compress.

| | rows | uncompressed | brotli |
|---|---|---|---|
| cards | 37,563 | 4.1MB | 1.1MB |
| prints | 108,275 | 7.2MB | 2.5MB |

Measured 2026-09-07: 3.67MB over the wire, inside the 4-5MB target in
[`architecture.md`](architecture.md).

**Printings are grouped by card, in the cards file's order**, so a card's
printings are the run of `printings` rows where the preceding counts end, and
the leading row is the printing search would show. That is why the pair carries
one version and why the build refuses to publish runs that don't add up: an
index read against the wrong ordering is wrong quietly.

**Names are per card. Printed names are per printing** — 2,525 paper printings
carry one, 32KB in total, so a Japanese card is found by the name on its own
printing and no per-language index is needed.

**Ids stay 36-character hex.** Base64 of the UUID bytes saved 0.5MB when we
compressed the artifact ourselves, and costs every consumer a decode before it
can write a `scryfallId` or build an image URL. Brotli took more than that for
free, so this stays in reserve.

**Rows are fixed width.** Trimming trailing nulls and zeros saved 1.8%, which
doesn't pay for a format where a row's length means something.

Low-cardinality columns are integers indexing tables in the header — sets,
rarity, layout, image status, language, and finishes as a bitmask. Each list
runs commonest first, so the value that repeats most is one digit.

Left out: oracle text, keywords, power and toughness, legality, the reserved
list and EDHREC rank. Collection tracking needs none of them and they are
another 2.3MB, so they become a third file when decks arrive.

## What manual search surfaces

Filtering was the wrong first instinct: almost everything is a real card
someone can own. Only digital printings can't be, which makes them a category
error rather than a preference, so they are excluded outright and no toggle
reaches them. Un-sets, special editions and oversized cards stay searchable —
Unfinity acorn cards are Legacy-legal, and someone with a 30th Anniversary Mox
searching and finding nothing is a worse failure than a noisy result.

The noise was mostly a grouping problem. Paper alone is 108,275 printings
across 37,563 cards, so "Forest" returned 865 rows. One row per card, with a
count, and a representative printing chosen by preferring booster printings
from expansions and core sets:

| | printings | rank |
|---|---|---|
| cards | 96,657 | first |
| tokens, emblems | 3,245 | second |
| art series | 2,650 | third |

Art series carry their own `oracle_id`, so grouping alone would leave them
competing with the card they depict — hence the tier. An exact name match
still beats the tier, because someone typing a token's name means the token.

Tokens and art series each have a toggle, and so does grouping, all on by
default. Shipping the extras costs about 18% more client artifact (~1.6MB of
~8.9MB of index), so the toggles work offline rather than needing a round trip.

## Open questions

**Trade quantity.** Two of the trackers we import from carry one. A trade list
is the better model, but the column has nowhere to land, so import and export
both need a defined mapping rather than silent loss. See the comparison above.

**Repeated tokens.** Tokens from different sets carry different oracle ids,
so grouping doesn't collapse them: searching "goblin" still returns five rows
of Goblin token. Grouping them wants a key that isn't `oracle_id` — name plus
type plus power and toughness, probably — and that's guesswork until someone
complains.

## References

- [Scryfall API docs](https://scryfall.com/docs/api) — data/image use rules
- [Scryfall bulk data](https://scryfall.com/docs/api/bulk-data)
- [Scryfall migrations](https://api.scryfall.com/migrations) — retired and
  merged printing ids
- [MTG Wiki: information below the text box](https://mtg.wiki/page/Information_below_the_text_box)
  — premium indicator, set code, collector number layout
