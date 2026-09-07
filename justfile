# The whole workflow, so `just --list` beats remembering which toolchain each
# step wants. Every recipe is a plain command underneath.

db := env("MANASPHERE_DATABASE", "manasphere.db")

[private]
default:
    @just --list

# every check CI runs that can run on one machine
check: fmt-check lint test spell deny lexicons

# format in place
fmt:
    cargo fmt --all

[private]
fmt-check:
    cargo fmt --all --check

# clippy, warnings denied as CI denies them
lint:
    cargo clippy --locked --all-targets --all-features -- -D warnings

# the test suite, optionally filtered: `just test search`
test filter="":
    cargo test --locked --all-targets {{ filter }}

# spelling, at the version prek pins
spell:
    prek run --all-files typos

# advisories, licenses, duplicate versions and crate sources
deny:
    cargo deny check

# validate the lexicons against atproto's own implementation
lexicons:
    cd tools/lexicon-check && bun install && bun run check

# serve the catalog and the client metadata document
serve:
    MANASPHERE_DATABASE={{ db }} cargo run -p manasphere-appview

# sync the card cache from Scryfall (~78MB), or from a file already on disk
sync file="":
    cargo run --release -p manasphere-core --example sync -- {{ db }} {{ file }}

# build the client artifact and report its size, optionally writing the files
catalog out="":
    cargo run --release -p manasphere-core --example catalog -- {{ db }} {{ out }}
