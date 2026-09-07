//! Card cache tests, against real printings captured 2026-09-07.
//!
//! Four cards, each carrying something the schema has to survive: a plain
//! multicolour creature, a `reversible_card` with no top-level `oracle_id`, a
//! transform layout, and a Japanese printing with a `printed_name`.

use std::io::Cursor;

use manasphere_core::cards::{self, SyncReport};
use manasphere_core::{Error, open_memory};
use manasphere_scryfall::{BulkData, CardStream};
use sqlx::SqlitePool;

const CARDS: &str = include_str!("fixtures/cards.jsonl");

/// Deserialised rather than constructed, so the test doesn't need `uuid`.
fn bulk(updated_at: &str) -> BulkData {
    serde_json::from_value(serde_json::json!({
        "id": "e2ef41e3-5778-4bc2-af3f-78eca4dd9c23",
        "type": "default_cards",
        "name": "Default Cards",
        "updated_at": updated_at,
        "jsonl_download_uri": "https://example.invalid/default-cards.jsonl.gz",
        "compressed_size": 78_059_432_u64,
    }))
    .expect("bulk data fixture should parse")
}

fn stream(ndjson: impl Into<Vec<u8>>) -> CardStream {
    CardStream::new(Cursor::new(ndjson.into()))
}

async fn seeded() -> (SqlitePool, SyncReport) {
    let pool = open_memory().await.expect("migrations should apply");
    let report = cards::replace(
        &pool,
        &bulk("2026-09-06T21:05:43.673+00:00"),
        &mut stream(CARDS),
    )
    .await
    .expect("fixture should sync");
    (pool, report)
}

/// The columns these tests assert on. sqlx 0.9 only takes `&'static str` SQL,
/// which rules out building the column name into the query.
#[derive(Debug, sqlx::FromRow)]
struct Row {
    oracle_id: Option<String>,
    mana_cost: Option<String>,
    card_faces: Option<String>,
    colors: Option<String>,
    color_identity: String,
}

async fn row(pool: &SqlitePool, card: &str) -> Row {
    sqlx::query_as(
        "SELECT oracle_id, mana_cost, card_faces, colors, color_identity
         FROM cards WHERE name LIKE ?",
    )
    .bind(format!("{card}%"))
    .fetch_one(pool)
    .await
    .expect("card should be in the cache")
}

#[tokio::test]
async fn migrations_apply_to_an_empty_database() {
    let pool = open_memory().await.expect("migrations should apply");
    assert_eq!(cards::count(&pool).await.unwrap(), 0);
    assert_eq!(
        cards::last_synced(&pool, "default_cards").await.unwrap(),
        None
    );
}

#[tokio::test]
async fn replace_writes_every_card_and_records_the_file() {
    let (pool, report) = seeded().await;

    assert_eq!(
        report,
        SyncReport {
            written: 4,
            skipped: 0
        }
    );
    assert_eq!(cards::count(&pool).await.unwrap(), 4);
    assert_eq!(
        cards::last_synced(&pool, "default_cards")
            .await
            .unwrap()
            .as_deref(),
        Some("2026-09-06T21:05:43.673+00:00"),
    );
}

/// Scryfall gives `reversible_card` printings no top-level `oracle_id`, so the
/// cache lifts it off the faces. Without that, a card you own can't be put in a
/// deck, since design entries key on `oracle_id`.
#[tokio::test]
async fn reversible_cards_get_their_oracle_id_from_the_faces() {
    let (pool, _) = seeded().await;

    let jinnie = row(&pool, "Jinnie Fay").await;
    assert_eq!(
        jinnie.oracle_id.as_deref(),
        Some("61fbaaf2-4286-4e9a-b9cb-aa31262b596a"),
    );
    // The rest of the gameplay data still only exists on the faces.
    assert_eq!(jinnie.mana_cost, None);
    assert!(jinnie.card_faces.is_some());
}

/// Every printing in Default Cards resolves to an oracle id one way or the
/// other, so nothing in the fixture should be left without one.
#[tokio::test]
async fn every_printing_resolves_to_an_oracle_id() {
    let (pool, _) = seeded().await;

    let (missing,): (i64,) = sqlx::query_as("SELECT count(*) FROM cards WHERE oracle_id IS NULL")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(missing, 0);
}

#[tokio::test]
async fn colours_are_canonicalised_to_wubrg_order() {
    let (pool, _) = seeded().await;

    // Scryfall sends this one as ["B","R","U"].
    let admiral = row(&pool, "Admiral Beckett").await;
    assert_eq!(admiral.colors.as_deref(), Some("UBR"));
    assert_eq!(admiral.color_identity, "UBR");

    // The faces carry the colours, so the column is null rather than empty.
    assert_eq!(row(&pool, "Jinnie Fay").await.colors, None);
}

#[tokio::test]
async fn json_columns_are_queryable_as_json() {
    let (pool, _) = seeded().await;

    let (legal,): (String,) = sqlx::query_as(
        "SELECT json_extract(legalities.json, '$.commander')
         FROM cards JOIN legalities ON legalities.id = cards.legalities_id
         WHERE cards.name LIKE 'Admiral%'",
    )
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(legal, "legal");
}

async fn legality_rows(pool: &SqlitePool) -> i64 {
    let (rows,): (i64,) = sqlx::query_as("SELECT count(*) FROM legalities")
        .fetch_one(pool)
        .await
        .unwrap();
    rows
}

/// Two printings that share a legality combination must store it once — the
/// whole reason the column is a reference. The fixture's four cards each have
/// their own combination, so this reprints one under a new id.
#[tokio::test]
async fn identical_legalities_are_stored_once() {
    let pool = open_memory().await.unwrap();
    let card = CARDS.lines().next().unwrap();
    let mut reprint: serde_json::Value = serde_json::from_str(card).unwrap();
    reprint["id"] = serde_json::json!("00000000-0000-4000-8000-000000000001");
    reprint["collector_number"] = serde_json::json!("reprint");

    let ndjson = format!("{card}\n{reprint}\n");
    let report = cards::replace(&pool, &bulk("x"), &mut stream(ndjson))
        .await
        .unwrap();

    assert_eq!(report.written, 2);
    assert_eq!(legality_rows(&pool).await, 1);
}

/// A replace clears the lookup table too, so dead combinations don't pile up.
#[tokio::test]
async fn replacing_does_not_accumulate_legalities() {
    let (pool, _) = seeded().await;
    let before = legality_rows(&pool).await;
    assert_eq!(before, 4, "the four fixture cards differ in legality");

    cards::replace(
        &pool,
        &bulk("2026-09-07T00:00:00.000+00:00"),
        &mut stream(CARDS),
    )
    .await
    .unwrap();

    assert_eq!(legality_rows(&pool).await, before);
}

#[tokio::test]
async fn a_printing_is_found_by_set_number_and_language() {
    let (pool, _) = seeded().await;

    let (set_code, number, lang): (String, String, String) =
        sqlx::query_as("SELECT set_code, collector_number, lang FROM cards WHERE lang = 'ja'")
            .fetch_one(&pool)
            .await
            .unwrap();

    let id = cards::printing_id(&pool, &set_code, &number, &lang)
        .await
        .unwrap();
    assert!(id.is_some());
    assert!(
        cards::printing_id(&pool, &set_code, &number, "en")
            .await
            .unwrap()
            .is_none()
    );
}

#[tokio::test]
async fn search_finds_a_card_by_name_prefix() {
    let (pool, _) = seeded().await;

    let hits = cards::search(&pool, "admiral beck", 10).await.unwrap();
    assert_eq!(hits.len(), 1);
    assert!(hits[0].name.starts_with("Admiral Beckett"));
}

#[tokio::test]
async fn search_finds_a_non_english_printing_by_its_printed_name() {
    let (pool, _) = seeded().await;

    let hits = cards::search(&pool, "暴虐", 10).await.unwrap();
    assert_eq!(hits.len(), 1);
    assert_eq!(hits[0].lang, "ja");
    assert!(hits[0].printed_name.is_some());
}

/// User input reaches FTS5, which has its own query syntax.
#[tokio::test]
async fn search_treats_fts_syntax_as_text() {
    let (pool, _) = seeded().await;

    for query in ["\"", "admiral OR NOT", "a*(b)", "^admiral", ""] {
        cards::search(&pool, query, 10)
            .await
            .unwrap_or_else(|error| panic!("{query:?} should not error: {error}"));
    }
}

#[tokio::test]
async fn an_empty_stream_leaves_the_previous_catalogue_alone() {
    let (pool, _) = seeded().await;

    let error = cards::replace(
        &pool,
        &bulk("2026-09-07T00:00:00.000+00:00"),
        &mut stream(""),
    )
    .await
    .expect_err("an empty stream should be refused");

    assert!(matches!(error, Error::EmptySync), "got {error:?}");
    assert_eq!(cards::count(&pool).await.unwrap(), 4, "cache was emptied");
    assert_eq!(
        cards::last_synced(&pool, "default_cards")
            .await
            .unwrap()
            .as_deref(),
        Some("2026-09-06T21:05:43.673+00:00"),
        "the refused sync recorded itself",
    );
}

#[tokio::test]
async fn replacing_does_not_accumulate() {
    let (pool, _) = seeded().await;

    let report = cards::replace(
        &pool,
        &bulk("2026-09-07T00:00:00.000+00:00"),
        &mut stream(CARDS),
    )
    .await
    .unwrap();

    assert_eq!(report.written, 4);
    assert_eq!(cards::count(&pool).await.unwrap(), 4);
    assert_eq!(cards::search(&pool, "admiral", 10).await.unwrap().len(), 1);
}

#[tokio::test]
async fn a_bad_line_is_skipped_and_counted() {
    let pool = open_memory().await.unwrap();
    let ndjson = format!("{}\nnot json\n", CARDS.lines().next().unwrap());

    let report = cards::replace(&pool, &bulk("x"), &mut stream(ndjson))
        .await
        .unwrap();

    assert_eq!(
        report,
        SyncReport {
            written: 1,
            skipped: 1
        }
    );
    assert_eq!(cards::count(&pool).await.unwrap(), 1);
}
