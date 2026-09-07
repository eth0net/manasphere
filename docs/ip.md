# Licensing and IP

What can be built and charged for, and under what licence it ships.

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

## References

- [WotC Fan Content Policy](https://company.wizards.com/en/legal/fancontentpolicy)
- [Scryfall Terms of Service](https://scryfall.com/docs/terms)
- [EDHREC Terms of Use](https://edhrec.com/terms) — no automated queries,
  personal noncommercial use only
