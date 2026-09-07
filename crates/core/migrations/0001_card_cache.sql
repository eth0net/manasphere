-- The card print cache. Everything here derives from Scryfall's Default Cards
-- bulk file and is rebuilt by re-running the sync, so it is disposable.

-- Legality is per printing, not per card: a gold-bordered reprint is legal
-- nowhere. Only a few hundred distinct combinations exist, so they live here
-- rather than repeating on every printing.
CREATE TABLE legalities (
    id   INTEGER NOT NULL PRIMARY KEY,
    json TEXT    NOT NULL UNIQUE
) STRICT;

-- A card, as the rules see it. Every column here was checked to be constant
-- across a card's printings.
CREATE TABLE oracle (
    id             TEXT    NOT NULL PRIMARY KEY,
    name           TEXT    NOT NULL,
    type_line      TEXT,
    mana_cost      TEXT,
    cmc            REAL,
    oracle_text    TEXT,
    -- Canonical WUBRG order, so a color identity compares as a string.
    colors         TEXT,
    color_identity TEXT    NOT NULL,
    power          TEXT,
    toughness      TEXT,
    loyalty        TEXT,
    defense        TEXT,
    keywords       TEXT    NOT NULL,  -- JSON array
    reserved       INTEGER NOT NULL,
    edhrec_rank    INTEGER,
    game_changer   INTEGER,

    -- Derived at sync so search needs no window functions: 0 card, 1 token or
    -- emblem, 2 art series. Search ranks in that order.
    kind           INTEGER NOT NULL,
    -- Whether any printing exists on paper. A card that only ever existed on
    -- Arena can't be owned, so search never returns one.
    paper          INTEGER NOT NULL,
    -- Paper printings only, being what a collector could own.
    printings      INTEGER NOT NULL,
    -- The printing to show for the card. Deliberately not a foreign key: it
    -- would close a cycle with cards.oracle_id and dictate insert order.
    default_print  TEXT    NOT NULL
) STRICT;

-- One physical printing.
CREATE TABLE cards (
    id               TEXT    NOT NULL PRIMARY KEY,
    oracle_id        TEXT    NOT NULL REFERENCES oracle(id),
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
    border_color     TEXT    NOT NULL,
    frame            TEXT    NOT NULL,
    artist           TEXT,
    flavor_text      TEXT,
    -- 'missing' and 'placeholder' printings have nothing behind the CDN URL
    -- derived from the id.
    image_status     TEXT    NOT NULL,
    -- Verbatim JSON. The shape differs by layout, so it stays a document.
    card_faces       TEXT
) STRICT;

-- What a CSV row from ManaBox and friends identifies. Unique across all
-- 117,630 printings in Default Cards, checked rather than assumed.
CREATE UNIQUE INDEX cards_printing ON cards (set_code, collector_number, lang);

CREATE INDEX cards_oracle_id ON cards (oracle_id);

-- Name search, one row per card so results group without a window function.
-- Not external content: the two name sources are in different tables.
CREATE VIRTUAL TABLE card_search USING fts5 (
    name,
    printed_names,
    oracle_id UNINDEXED,
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
