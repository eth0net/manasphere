# Contributing

Manasphere is pre-v0: plenty of design work in
[`docs/roadmap.md`](docs/roadmap.md), very little code yet. The most useful
contribution right now is a second opinion on the lexicon shapes, before
records start existing in other people's PDSes — that's the one part which is
expensive to change later.

## Getting set up

Rust (stable, 2024 edition) and [Bun](https://bun.sh) for the frontend. Bun is
only needed if you're touching `web/`.

```sh
git clone https://github.com/eth0net/manasphere
cd manasphere
cargo test
```

The workspace is empty until the first crate lands, so `cargo test` won't
resolve `crates/*` yet.

## Before opening a pull request

```sh
cargo fmt
cargo clippy --all-targets --all-features    # must be warning-free
cargo test
```

CI runs the same on Linux, macOS and Windows.

## Commit and PR style

Conventional commits. The subject carries it; explain *why* in the body when
the diff doesn't. One logical change per commit.

## Sign your commits off

Commits need a [Developer Certificate of Origin](https://developercertificate.org)
sign-off, which `git commit -s` adds:

```
Signed-off-by: Your Name <you@example.com>
```

It certifies you wrote the contribution, or that it came from somewhere
compatibly licensed and you have the right to submit it. There's no CLA and no
copyright assignment.

## Attribution

Developed with [Claude Code](https://claude.com/claude-code).

## Licensing

Contributions to the AppView are licensed under AGPL-3.0, and contributions to
`lexicons/` under MIT, each matching the code around them. By submitting a pull
request you agree to that.

The split is deliberate: NSID schemas are shared vocabulary, and copyleft on a
schema file would discourage exactly the adoption we want. See the Licensing
section of the roadmap for the reasoning.
