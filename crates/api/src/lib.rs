//! HTTP handlers.
//!
//! Production serves the app from Cloudflare Pages and the catalog from object
//! storage, so this process serves neither. What is left is a health check and
//! a server for the catalog directory, so the client can be developed against
//! it. There are no write handlers and there will not be — the browser writes
//! to the user's own PDS. See `docs/architecture.md`.

use std::path::PathBuf;

use axum::Router;
use axum::extract::State;
use axum::http::StatusCode;
use axum::http::header::{CACHE_CONTROL, CONTENT_TYPE};
use axum::response::{IntoResponse, Response};
use axum::routing::get;
use manasphere_core::cards;
use serde::Serialize;
use sqlx::SqlitePool;
use tower_http::services::ServeDir;

/// Every route the server answers, with `catalog` served as files underneath.
///
/// Nothing here sets `Cache-Control`: the objects carry their own once
/// uploaded, and a dev server wants none of it.
pub fn router(pool: SqlitePool, catalog: PathBuf) -> Router {
    Router::new()
        .route("/health", get(health))
        .with_state(pool)
        .fallback_service(ServeDir::new(catalog))
}

#[derive(Debug, Serialize)]
struct Health {
    /// The bulk file the cache holds, absent before the first sync.
    cache: Option<String>,
}

async fn health(State(pool): State<SqlitePool>) -> Response {
    let Ok(cache) = cards::last_synced(&pool, "default_cards").await else {
        // A health check that reports healthy when the database is gone is
        // worse than none.
        return (
            StatusCode::SERVICE_UNAVAILABLE,
            "the database is not answering\n",
        )
            .into_response();
    };

    let body = serde_json::to_vec(&Health { cache }).expect("plain data");
    (
        StatusCode::OK,
        [
            (CONTENT_TYPE, "application/json"),
            (CACHE_CONTROL, "no-store"),
        ],
        body,
    )
        .into_response()
}
