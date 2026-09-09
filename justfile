# The whole workflow, so `just --list` beats remembering which toolchain each
# step wants. Every recipe is a plain command underneath.

db := env("MANAWEB_DATABASE", "manaweb.db")

[private]
default:
    @just --list

# every check CI runs that can run on one machine
[group('checks')]
check: rust deny spell prose lexicons web

# the Rust side, needing nothing but a cargo toolchain
[group('checks')]
rust: fmt-check lint test

# format in place
[group('checks')]
fmt:
    cargo fmt --all

[private]
fmt-check:
    cargo fmt --all --check

# clippy, warnings denied as CI denies them
[group('checks')]
lint:
    cargo clippy --locked --all-targets --all-features -- -D warnings

# the Rust test suite, optionally filtered: `just test search`
[group('checks')]
test filter="":
    cargo test --locked --all-targets {{ filter }}

# spelling, at the version prek pins (needs prek)
[group('checks')]
spell:
    prek run --all-files typos

# advisories, licenses, duplicate versions and crate sources (needs cargo-deny)
[group('checks')]
deny:
    cargo deny check

# prose said twice: a comment restating a doc, or a doc another (needs bun)
[group('checks')]
prose:
    cd tools/prose-check && bun install && bun run check

# validate the lexicons against atproto's own implementation (needs bun)
[group('checks')]
lexicons:
    cd tools/lexicon-check && bun install && bun run check

# lint, typecheck, test and build the client (needs bun)
[group('checks')]
web:
    cd web && bun install && bun run check

# export the catalog and serve it for local development
[group('dev')]
serve:
    MANAWEB_DATABASE={{ db }} cargo run -p manaweb-appview

# the client's dev server, fetching the catalog from `just serve`
[group('dev')]
client:
    cd web && bun install && bun run dev

# sync the card cache from Scryfall (~78MB), or from a file already on disk
[group('dev')]
sync file="":
    cargo run --release -p manaweb-core --example sync -- {{ db }} {{ file }}

# build the client artifact and report its size, optionally writing the files
[group('dev')]
catalog out="":
    cargo run --release -p manaweb-core --example catalog -- {{ db }} {{ out }}

# Needs a deployment rather than a checkout, which is why it is not in `check`.
[doc('fetch a deployed client metadata document and hold it to its own URL')]
[group('deploy')]
[script('python3')]
verify-oauth url="https://manaweb.app/oauth/client-metadata.json":
    import json, sys, urllib.error, urllib.request

    url = "{{ url }}"
    try:
        response = urllib.request.urlopen(url)
    except urllib.error.HTTPError as error:
        response = error  # an HTTPError is the response, and 404 is a finding
    except urllib.error.URLError as error:
        sys.exit(f"  FAIL  {url} unreachable: {error.reason}")

    with response:
        status = response.status
        kind = response.headers.get_content_type()
        body = response.read()

    # A single-page fallback answers 200 with HTML for a path it doesn't have,
    # so "did it deploy" and "is it JSON" are one question.
    problems = []
    if status != 200:
        problems.append(f"status {status}, must be exactly 200")
    if kind != "application/json":
        problems.append(f"content-type {kind}, must be application/json")

    try:
        client_id = json.loads(body).get("client_id")
    except ValueError as error:
        problems.append(f"not JSON: {error}")
    else:
        if client_id != url:
            problems.append(f"client_id is {client_id}, must equal the URL fetched")

    for problem in problems:
        print(f"  FAIL  {problem}")
    print("\nFAILED" if problems else "  ok    served as its own client_id")
    sys.exit(1 if problems else 0)
