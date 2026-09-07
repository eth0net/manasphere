# Contributing

Manasphere is pre-v0: plenty of design in [`docs/`](docs/roadmap.md),
little code yet. The most useful contribution is a second opinion on the
lexicon shapes, before records exist in other people's PDSes — that's the part
expensive to change later.

## Getting set up

Rust (stable, 2024 edition), and [Bun](https://bun.sh) if you're touching
`web/` or `tools/`.

```sh
git clone https://github.com/eth0net/manasphere
cd manasphere
prek install
cargo test
```

[prek](https://github.com/j178/prek) runs what CI runs — `cargo fmt`, a
warning-free `cargo clippy --all-targets --all-features`, `cargo test` and the
sign-off check — on commit and push, so a red build costs no round trip. CI
itself also runs on macOS and Windows.

[just](https://github.com/casey/just) wraps the longer commands: `just serve`
starts the server, `just check` does the lot in one go. `just --list` for the
rest.

Tests are offline, against Scryfall responses captured under
`crates/*/tests/fixtures`. The parts that talk to Scryfall are examples, run by
hand, since they pull ~78MB from a free service:

```sh
cargo run --release -p manasphere-scryfall --example stream  # parse only
just sync                                                    # into the cache
```

Keep the bulk file and pass it to `just sync` as an argument, so iterating
doesn't re-download it. `just catalog` then builds the client artifact from
whatever the cache holds, and needs no network at all.

## Commits

Conventional commits. The subject carries it; explain *why* in the body only
when the diff doesn't. One logical change per commit.

Commits need a [DCO](https://developercertificate.org) sign-off, which
`git commit -s` adds:

```
Signed-off-by: Your Name <you@example.com>
```

It certifies you wrote the contribution, or that it came from somewhere
compatibly licensed and you have the right to submit it. No CLA, no copyright
assignment. Git has no config for it, so `prek install` adds a `commit-msg`
check; merge commits are exempt.

## Attribution

Developed with [Claude Code](https://claude.com/claude-code).

## Licensing

Contributions to the AppView are AGPL-3.0, and contributions to `lexicons/` are
MIT, each matching the code around them. Submitting a pull request agrees to
that. The split is deliberate — NSID schemas are shared vocabulary — and the
reasoning is in [`docs/ip.md`](docs/ip.md).
