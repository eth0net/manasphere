# Recipes that need more than one word. `cargo test` and friends still work.

db := env("MANASPHERE_DATABASE", "manasphere.db")

[private]
default:
    @just --list

# everything CI runs
check:
    cargo fmt --all --check
    cargo clippy --locked --all-targets --all-features
    cargo test --locked --all-targets
    cd tools/lexicon-check && bun run check

# serve the catalog and the client metadata document
serve:
    MANASPHERE_DATABASE={{ db }} cargo run -p manasphere-appview

# sync the card cache from Scryfall (~78MB), or from a file already on disk
sync file="":
    cargo run --release -p manasphere-core --example sync -- {{ db }} {{ file }}

# build the client artifact and report its size, optionally writing the files
catalog out="":
    cargo run --release -p manasphere-core --example catalog -- {{ db }} {{ out }}

# validate the lexicons against atproto's own implementation
lexicons:
    cd tools/lexicon-check && bun install && bun run check
