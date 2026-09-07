//! The Scryfall print cache: one full replace per bulk file, plus the lookups
//! v0 needs.

use std::collections::HashMap;

use manasphere_scryfall::{BulkData, Card, CardStream, Color, Error as ScryfallError};
use sqlx::{Sqlite, SqlitePool, Transaction};

use crate::{Error, Result};

/// What one replace did.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub struct SyncReport {
    /// `i64` to match what SQLite stores and what [`count`] returns.
    pub written: i64,
    /// Lines that didn't parse. Skipped rather than fatal, so one odd record
    /// doesn't cost a week's refresh — but a jump here means Scryfall changed
    /// something, and it's the caller's job to notice.
    pub skipped: i64,
}

/// The `updated_at` of the last file ingested for `kind`, if any.
///
/// Compare it against a fresh index entry to skip a file already in the cache.
///
/// # Errors
///
/// Fails on a database error.
pub async fn last_synced(pool: &SqlitePool, kind: &str) -> Result<Option<String>> {
    let row: Option<(String,)> = sqlx::query_as("SELECT updated_at FROM bulk_sync WHERE kind = ?")
        .bind(kind)
        .fetch_optional(pool)
        .await?;
    Ok(row.map(|(updated_at,)| updated_at))
}

/// Replaces the entire cache from `cards`, in one transaction.
///
/// Readers stay on the previous catalogue until it commits, and a failure part
/// way leaves that catalogue intact.
///
/// # Errors
///
/// Fails on a database error, an unreadable stream, or a stream that yielded no
/// cards at all — that last one would otherwise empty the cache silently.
pub async fn replace(
    pool: &SqlitePool,
    bulk: &BulkData,
    cards: &mut CardStream,
) -> Result<SyncReport> {
    let mut tx = pool.begin().await?;
    let mut report = SyncReport::default();
    let mut legalities = HashMap::new();

    sqlx::query("DELETE FROM cards").execute(&mut *tx).await?;
    sqlx::query("DELETE FROM legalities")
        .execute(&mut *tx)
        .await?;

    loop {
        match cards.try_next().await {
            Ok(None) => break,
            Ok(Some(card)) => {
                let legalities_id = intern_legalities(&mut tx, &mut legalities, &card).await?;
                insert(&mut tx, &card, legalities_id).await?;
                report.written += 1;
            }
            // One unparseable line shouldn't cost the whole refresh.
            Err(ScryfallError::Parse { .. }) => report.skipped += 1,
            Err(other) => return Err(other.into()),
        }
    }

    if report.written == 0 {
        // Dropping the transaction rolls back the DELETE.
        return Err(Error::EmptySync);
    }

    // Cheaper than per-row triggers, and the sync is the only writer.
    sqlx::query("INSERT INTO cards_fts(cards_fts) VALUES ('rebuild')")
        .execute(&mut *tx)
        .await?;

    sqlx::query(
        "INSERT INTO bulk_sync (kind, updated_at, card_count) VALUES (?, ?, ?)
         ON CONFLICT(kind) DO UPDATE SET
             updated_at = excluded.updated_at,
             card_count = excluded.card_count,
             synced_at  = datetime('now')",
    )
    .bind(&bulk.kind)
    .bind(&bulk.updated_at)
    .bind(report.written)
    .execute(&mut *tx)
    .await?;

    tx.commit().await?;

    // The replace writes the whole catalogue, so the WAL is about as large as
    // the database until it's checkpointed. Small VPS, so reclaim it now.
    sqlx::query("PRAGMA wal_checkpoint(TRUNCATE)")
        .execute(pool)
        .await?;

    Ok(report)
}

/// Stores each distinct legality combination once and hands back its id.
async fn intern_legalities(
    tx: &mut Transaction<'_, Sqlite>,
    seen: &mut HashMap<String, i64>,
    card: &Card,
) -> Result<i64> {
    let encoded = json(&card.legalities);
    if let Some(id) = seen.get(&encoded) {
        return Ok(*id);
    }

    let (id,): (i64,) = sqlx::query_as("INSERT INTO legalities (json) VALUES (?) RETURNING id")
        .bind(&encoded)
        .fetch_one(&mut **tx)
        .await?;
    seen.insert(encoded, id);
    Ok(id)
}

async fn insert(tx: &mut Transaction<'_, Sqlite>, card: &Card, legalities_id: i64) -> Result<()> {
    sqlx::query(
        "INSERT INTO cards (
            id, oracle_id, name, printed_name, lang, released_at, layout,
            set_code, set_name, set_type, collector_number, rarity,
            mana_cost, cmc, type_line, oracle_text, colors, color_identity,
            power, toughness, loyalty, defense,
            keywords, legalities_id, games, finishes,
            digital, promo, reprint, variation, oversized, booster, full_art,
            textless, reserved,
            border_color, frame, artist, flavor_text, image_status,
            card_faces, edhrec_rank, game_changer
        ) VALUES (
            ?, ?, ?, ?, ?, ?, ?,
            ?, ?, ?, ?, ?,
            ?, ?, ?, ?, ?, ?,
            ?, ?, ?, ?,
            ?, ?, ?, ?,
            ?, ?, ?, ?, ?, ?, ?,
            ?, ?,
            ?, ?, ?, ?, ?,
            ?, ?, ?
        )",
    )
    .bind(card.id.to_string())
    .bind(card.oracle_id.map(|id| id.to_string()))
    .bind(&card.name)
    .bind(&card.printed_name)
    .bind(&card.lang)
    .bind(&card.released_at)
    .bind(&card.layout)
    .bind(&card.set_code)
    .bind(&card.set_name)
    .bind(&card.set_type)
    .bind(&card.collector_number)
    .bind(&card.rarity)
    .bind(&card.mana_cost)
    .bind(card.cmc.map(f64::from))
    .bind(&card.type_line)
    .bind(&card.oracle_text)
    .bind(card.colors.as_deref().map(canonical_colors))
    .bind(canonical_colors(&card.color_identity))
    .bind(&card.power)
    .bind(&card.toughness)
    .bind(&card.loyalty)
    .bind(&card.defense)
    .bind(json(&card.keywords))
    .bind(legalities_id)
    .bind(json(&card.games))
    .bind(json(&card.finishes))
    .bind(card.digital)
    .bind(card.promo)
    .bind(card.reprint)
    .bind(card.variation)
    .bind(card.oversized)
    .bind(card.booster)
    .bind(card.full_art)
    .bind(card.textless)
    .bind(card.reserved)
    .bind(&card.border_color)
    .bind(&card.frame)
    .bind(&card.artist)
    .bind(&card.flavor_text)
    .bind(&card.image_status)
    .bind(card.card_faces.as_ref().map(|faces| faces.get().to_owned()))
    .bind(card.edhrec_rank.map(i64::from))
    .bind(card.game_changer)
    .execute(&mut **tx)
    .await?;

    Ok(())
}

/// WUBRG order, so a colour identity compares as a string. `Color` is declared
/// in that order, so sorting is enough.
fn canonical_colors(colors: &[Color]) -> String {
    let mut sorted = colors.to_vec();
    sorted.sort_unstable();
    sorted.iter().map(|color| color.as_str()).collect()
}

fn json<T: serde::Serialize>(value: &T) -> String {
    serde_json::to_string(value).expect("card fields are plain data")
}

/// Printings in the cache.
///
/// # Errors
///
/// Fails on a database error.
pub async fn count(pool: &SqlitePool) -> Result<i64> {
    let (count,): (i64,) = sqlx::query_as("SELECT count(*) FROM cards")
        .fetch_one(pool)
        .await?;
    Ok(count)
}

/// The print a CSV row identifies. Unique across Default Cards, so at most one.
///
/// # Errors
///
/// Fails on a database error.
pub async fn printing_id(
    pool: &SqlitePool,
    set_code: &str,
    collector_number: &str,
    lang: &str,
) -> Result<Option<String>> {
    let row: Option<(String,)> = sqlx::query_as(
        "SELECT id FROM cards
         WHERE set_code = ? AND collector_number = ? AND lang = ?",
    )
    .bind(set_code)
    .bind(collector_number)
    .bind(lang)
    .fetch_optional(pool)
    .await?;
    Ok(row.map(|(id,)| id))
}

/// Enough of a printing to render a search result.
#[derive(Debug, Clone, sqlx::FromRow)]
pub struct CardBrief {
    pub id: String,
    pub name: String,
    pub printed_name: Option<String>,
    pub set_code: String,
    pub collector_number: String,
    pub lang: String,
    pub image_status: String,
}

/// Name search, for a client that hasn't cached the catalogue yet.
///
/// Unfiltered: digital-only printings, tokens and art series all match. What
/// manual search should surface is still open — see `docs/roadmap.md`.
///
/// # Errors
///
/// Fails on a database error.
pub async fn search(pool: &SqlitePool, query: &str, limit: u32) -> Result<Vec<CardBrief>> {
    let Some(fts) = fts_query(query) else {
        return Ok(Vec::new());
    };

    Ok(sqlx::query_as(
        "SELECT cards.id, cards.name, cards.printed_name, cards.set_code,
                cards.collector_number, cards.lang, cards.image_status
         FROM cards_fts
         JOIN cards ON cards.rowid = cards_fts.rowid
         WHERE cards_fts MATCH ?
         ORDER BY bm25(cards_fts)
         LIMIT ?",
    )
    .bind(fts)
    .bind(limit)
    .fetch_all(pool)
    .await?)
}

/// Quotes each word and makes it a prefix, so user input can't be FTS5 syntax.
/// `None` when there's nothing to search for.
fn fts_query(query: &str) -> Option<String> {
    let terms: Vec<String> = query
        .split_whitespace()
        .map(|term| format!("\"{}\"*", term.replace('"', "\"\"")))
        .collect();

    (!terms.is_empty()).then(|| terms.join(" "))
}
