# Lexicons

atproto record schemas for Manasphere, rooted at `app.manasphere.*`. MIT rather
than AGPL like the rest of the repo — schemas are shared vocabulary. See
[LICENSE](LICENSE).

| NSID | One record |
|---|---|
| `app.manasphere.card` | A card you own, in however many copies |
| `app.manasphere.container` | A binder, box or deck box |
| `app.manasphere.deck` | A design with deck metadata, contents embedded |
| `app.manasphere.list` | A design without it — wishlist, trade pile, staging |
| `app.manasphere.snapshot` | A complete named copy of a design |
| `app.manasphere.defs` | Shapes shared between designs — no records |

Deck, list and snapshot run ahead of their implementation; decks arrive in
Phase 3. They stay freely changeable until records exist.

Why the shapes are what they are: [`docs/data-model.md`](../docs/data-model.md).

## Changing these

Additive optional fields are safe. Removing a field or adding a required one is
not — records live in repos we don't control. A new NSID is cheap, so prefer
one to widening an existing shape.

## Checking them

```sh
cd tools/lexicon-check && bun install && bun run check
```

Every schema against atproto's own validator, then records that must be
accepted and records that must be refused.
