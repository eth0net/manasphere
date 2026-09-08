# Search and filtering

What the client answers on its own, over the artifact in
[`scryfall.md`](scryfall.md). Nothing here reaches a server: the catalog is on
the device, so the only limit is which parts of it someone chose to hold.

## What manual search surfaces

Filtering was the wrong first instinct: almost everything is a real card
someone can own. Only digital printings can't be, which makes them a category
error rather than a preference, so they are excluded outright and no toggle
reaches them. Un-sets, special editions and oversized cards stay searchable —
Unfinity acorn cards are Legacy-legal, and someone with a 30th Anniversary Mox
searching and finding nothing is a worse failure than a noisy result.

The noise was mostly a grouping problem. Paper alone is 108,273 printings
across 37,564 cards, so "Forest" returned 865 rows. One row per card, with a
count, and a representative printing chosen by preferring booster printings
from expansions and core sets, then nonfoil over a foil-only twin sharing its
collector number. The order is total, ending in the printing id — the files
are named after their own bytes, so a tie left to SQLite would rename them for
nothing.

| | cards | printings | rank |
|---|---|---|---|
| cards | 34,244 | 102,379 | first |
| tokens, emblems | 1,077 | 3,244 | second |
| art series | 2,243 | 2,650 | third |

Art series carry their own `oracle_id`, so grouping alone would leave them
competing with the card they depict — hence the tier. An exact name match
still beats the tier, because someone typing a token's name means the token.

Tokens and art series each have a toggle, and so does grouping, all on by
default. The extras are 8.8% of card rows and 5.4% of printings, so they are
cheap enough to ship and hide rather than fetch on demand — the toggles work
offline.

## Ranking

Searching the artifact is a scan of 37,000 names costing a few milliseconds,
so the client builds no index. It ranks on exact match, then names where the
query starts a word, then anywhere at all; within a tier, the printing tiers
above, then popularity.

A whole-name prefix is deliberately *not* its own tier, or "bolt" fills on
Bolt Bend and Bolt Hound and never reaches the card anyone meant.

**Popularity is EDHREC rank, and reprint count where there is no rank.** 15%
of cards carry no rank — every token and art series, and the basic lands — so
an unranked card is scored as if its rank were `worst / printings`. Both
halves were needed: ranking the unranked last puts Karplusan Forest (#222)
above Forest, and dropping the rank puts Aladdin's Ring (#24,725) above The One
Ring (#91).

Being an EDH signal, it misjudges cards that format never sees: the Power Nine
rank nowhere, so "mox" leads with Chrome Mox and Mox Amber rather than Mox
Emerald. Acceptable for now — the honest fix is our own signal, below.

## Browsing, sorting and filtering

Not built. Worth recording that **the artifact already carries everything they
need**, so none of it is a format change: type line, colors, color identity,
mana cost, cmc, power and toughness, rarity, set, artist and layout are all
there.

- **Filtering** on type, color, color identity, mana cost, mana value and
  power, all of which are operators rather than a UI of their own — see the
  query language below.
- **Sorting** by name, cmc, rarity, printing count or popularity, which is a
  different comparator over the same scan.
- **A grid view** with the cell size or column count settable, since a wall of
  card images is how everyone else presents a collection and the image URLs
  derive from the print id.

**Our own popularity signal replaces EDHREC's** once Explore exists (Phase 3):
how many copies the network holds, and how many decks play a card, are both
things we would then know first-hand — computed from indexed records rather
than borrowed, covering the formats EDHREC doesn't, and the same input the
recommendations in [`roadmap.md`](roadmap.md) want.

## A query language, borrowed

Don't invent one. **Scryfall's syntax already is one**, every player knows it,
it is documented, and a query written in it means something outside this app —
which is what makes a shared search worth sharing. Checked against their docs:

| to ask | Scryfall says |
|---|---|
| red-green cards | `c:rg` |
| at least white and blue, but not red | `color>=uw -c:red` |
| instants an Esper commander can play | `id<=esper t:instant` |
| exactly two colors | `c=2` |
| more than three generic, one white, one blue | `m>3WU` |
| mana value five | `mv=5` |
| eight or more power | `pow>=8` |
| creatures that are top-heavy | `pow>tou` |
| ever printed in Russian | `in:ru` |

**The mana operator is already the interesting one.** A cost is *greater* than
another when it holds all the same symbols and more, and *less* when it holds
only a subset — so `m>3WU` is a subset relation rather than a numeric one,
which is exactly what "at least this much red" needs and what a per-color
number can't express.

**The color modes are operators.** ManaBox offers four buttons — exact,
inclusive, maximum, and Commander identity — and they are `c=`, `c>=`, `c<=`
and `id<=`. So the controls and the query say the same thing twice, which is
what makes prefilling work rather than being a trick: **the query string is the
state and the controls are a view over it**, either one editing it.

Three things fall out of that:

- **A shared search is a link**, because the query string is the URL. Nothing
  extra to build.
- **A saved search is a named query string** — short, portable, and meaningful
  to other apps because the syntax isn't ours. That is the argument for making
  it a record rather than local state, and it would be a lexicon, so it is not
  a decision yet.
- **An unsupported term is the prompt, not an error.** `o:draw` cannot run
  without the text part, so it says so and offers to fetch it. That is where a
  hint by the search bar earns its place: shown when a query asks for what the
  device doesn't hold, rather than nagging on arrival.

### What runs against the pair today

Everything the artifact carries, which is most of it: `c:` and `id:` with
their comparisons, `mv:`, `m:`, `t:`, `r:`, `s:`, `cn:`, `a:`, the layout and
flag predicates, and names. Mana pips are parsed out of the cost string, so
per-color filtering needs no new column.

Wanting a part it doesn't have: `o:` and `kw:` need text, `usd:` needs prices
(Phase 2), `f:` needs legality, and `lang:` is only as good as the languages
below.

**`pow` and `tou` don't fully compare.** They arrive as the `stats` string, and
Tarmogoyf is `*/1+*` — so a numeric filter has to treat a non-numeric power as
unmatched rather than as zero, and say so.

## Card languages

Three things get conflated, and only the middle one is a setting:

- **App language** — the interface chrome. Ordinary i18n, a separate concern,
  and allowed to lag.
- **Card language** — which name and text to show for a card. A setting, and
  the one that can range over every language Scryfall has.
- **Printing language** — a property of the copy someone owns, pinned by its
  print id.

Nothing about the third reaches a record. `(set, collector number, lang)` is
unique across all 117,630 printings, which is what `cards::printing_id` looks
up, so a language is a way of *finding* a print id rather than a field beside
one. ManaBox instead makes language an editable property of an entry, bulk
editable — the same fact through a different affordance, and where a CSV import
has to meet us.

**Which makes this a v0 problem rather than a later one.** Default Cards
carries 652 Japanese printings, 9 German and 5 Russian, so a German collection
exported from ManaBox resolves almost nothing. Import correctness needs the
languages before display ever does.

What it takes, in order:

1. **All Cards** — 392MB compressed, an estimated 590,000 printings from
   Default Cards' 78MB for 117,628. Streamed and filtered to `lang <> 'en'`, so
   nothing English is stored twice.
2. **A translations table, not a second shredding.** Only what varies by
   language: the printing's own id, its oracle id, lang, set, collector number,
   printed name, printed type line, printed text. Rules, colors and mana value
   are language-invariant and already in `oracle`. Roughly 470,000 rows at ~140
   bytes without printed text and ~290 with, so 65MB against 135MB — the text
   is the expensive half, and the reason it is opt-in separately.
3. **A `names` part per language**, one localized name per card at ~300KB
   brotli, because searching in a language needs every name at once. A specific
   printing's printed name resolves on demand from the API instead, being
   needed only for copies someone owns.
4. **English stays a fallback.** ManaBox's detail and the right one: search
   matches both, so choosing French doesn't stop someone typing an English
   name.
5. **`lang:` and `in:` then answer**, which is the operator table above.

## Where the choices live

A settings page owns the card language and which parts are held, and onboarding
asks the same two questions once — see [`data-model.md`](data-model.md). The
hints by the search bar are the third surface and the only one that appears
uninvited, so they are tied to a query that asked for something missing rather
than shown on a timer.

## References

- [Scryfall search syntax](https://scryfall.com/docs/syntax)
- [ManaBox search FAQ](https://www.manabox.app/guides/search/faq/)
