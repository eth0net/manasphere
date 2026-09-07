-- The card print cache. Everything here derives from Scryfall's Default Cards
-- bulk file and is rebuilt by re-running the sync, so it is disposable.

-- Legality is per printing in Scryfall's data (a gold-bordered reprint is legal
-- nowhere), but only 611 distinct combinations exist across 117,630 printings.
-- Inline, the same ~480 bytes repeated was 47% of the database.
CREATE TABLE legalities (
    id   INTEGER NOT NULL PRIMARY KEY,
    json TEXT    NOT NULL UNIQUE
) STRICT;

CREATE TABLE cards (
    id               TEXT    NOT NULL PRIMARY KEY,
    -- Absent on reversible_card printings, so nullable on purpose.
    oracle_id        TEXT,
    name             TEXT    NOT NULL,
    -- Set when lang is not English; the only way to find those by name.
    printed_name     TEXT,
    lang             TEXT    NOT NULL,
    released_at      TEXT    NOT NULL,
    layout           TEXT    NOT NULL,
    set_code         TEXT    NOT NULL,
    set_name         TEXT    NOT NULL,
    set_type         TEXT    NOT NULL,
    collector_number TEXT    NOT NULL,
    rarity           TEXT    NOT NULL,
    mana_cost        TEXT,
    cmc              REAL,
    type_line        TEXT,
    oracle_text      TEXT,
    -- Canonical WUBRG order, so a colour identity compares as a string.
    -- NULL when the faces carry the colours, '' when genuinely colourless.
    colors           TEXT,
    color_identity   TEXT    NOT NULL,
    power            TEXT,
    toughness        TEXT,
    loyalty          TEXT,
    defense          TEXT,
    keywords         TEXT    NOT NULL,  -- JSON array
    legalities_id    INTEGER NOT NULL REFERENCES legalities(id),
    games            TEXT    NOT NULL,  -- JSON array
    finishes         TEXT    NOT NULL,  -- JSON array
    digital          INTEGER NOT NULL,
    promo            INTEGER NOT NULL,
    reprint          INTEGER NOT NULL,
    variation        INTEGER NOT NULL,
    oversized        INTEGER NOT NULL,
    booster          INTEGER NOT NULL,
    full_art         INTEGER NOT NULL,
    textless         INTEGER NOT NULL,
    reserved         INTEGER NOT NULL,
    border_color     TEXT    NOT NULL,
    frame            TEXT    NOT NULL,
    artist           TEXT,
    flavor_text      TEXT,
    -- 'missing' and 'placeholder' printings have nothing behind the CDN URL
    -- derived from the id.
    image_status     TEXT    NOT NULL,
    -- Verbatim JSON. The shape differs by layout, so it stays a document.
    card_faces       TEXT,
    edhrec_rank      INTEGER,
    game_changer     INTEGER
) STRICT;

-- What a CSV row from ManaBox and friends identifies. Unique across all
-- 117,630 printings in Default Cards, checked rather than assumed.
CREATE UNIQUE INDEX cards_printing ON cards (set_code, collector_number, lang);

-- Design entries key on oracle_id; collection entries key on the print id.
CREATE INDEX cards_oracle_id ON cards (oracle_id);

-- Server-side name search: the fallback for a client that hasn't cached the
-- catalogue yet. External content, so names aren't stored twice, and there are
-- no sync triggers — the sync rebuilds the index once at the end instead of
-- paying per row. Any other writer must rebuild it too.
CREATE VIRTUAL TABLE cards_fts USING fts5 (
    name,
    printed_name,
    content = 'cards',
    tokenize = 'unicode61 remove_diacritics 2'
);

-- Lets a refresh skip a file it has already ingested.
CREATE TABLE bulk_sync (
    kind       TEXT    NOT NULL PRIMARY KEY,
    -- The bulk file's own updated_at, compared for inequality.
    updated_at TEXT    NOT NULL,
    card_count INTEGER NOT NULL,
    synced_at  TEXT    NOT NULL DEFAULT (datetime('now'))
) STRICT;
