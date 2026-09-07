//! HTTP handlers.
//!
//! Production serves the app, the catalog artifact and the client metadata
//! document from a CDN, all three being static files. What is left here is a
//! health check and a server for that directory, so the client can be
//! developed against it. There are no write handlers and there will not be —
//! the browser writes to the user's own PDS. See `docs/architecture.md`.

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

/// Every scope the client may request; a request can narrow this but not widen
/// it. `transition:generic` grants far more than the `repo:` scopes and is
/// only a fallback, so the client asks for it last — see `docs/atproto.md`.
const SCOPE: &str = concat!(
    "atproto",
    " repo:app.manasphere.card",
    " repo:app.manasphere.container",
    " repo:app.manasphere.deck",
    " repo:app.manasphere.list",
    " repo:app.manasphere.snapshot",
    " transition:generic",
);

/// Where the app is served from, without a trailing slash.
///
/// The OAuth `client_id` is a URL under it, so a wrong value fails at
/// authorization rather than at startup.
#[derive(Debug, Clone)]
pub struct Config {
    pub public_url: String,
}

/// The OAuth client metadata document.
///
/// Written to the site directory rather than served from a handler: its only
/// requirement is living at the `client_id` it declares, and login should not
/// fail because this process is down.
///
/// # Errors
///
/// Fails only if the document won't serialize.
pub fn client_metadata(config: &Config) -> serde_json::Result<Vec<u8>> {
    serde_json::to_vec_pretty(&ClientMetadata::new(&config.public_url))
}

#[derive(Debug, Serialize)]
struct ClientMetadata {
    client_id: String,
    client_name: &'static str,
    client_uri: String,
    redirect_uris: [String; 1],
    grant_types: [&'static str; 2],
    response_types: [&'static str; 1],
    scope: &'static str,
    /// A browser client keeps no secret, so it authenticates with none.
    token_endpoint_auth_method: &'static str,
    application_type: &'static str,
    dpop_bound_access_tokens: bool,
}

impl ClientMetadata {
    fn new(public_url: &str) -> Self {
        Self {
            client_id: format!("{public_url}/oauth/client-metadata.json"),
            client_name: "Manasphere",
            client_uri: public_url.to_owned(),
            redirect_uris: [format!("{public_url}/oauth/callback")],
            grant_types: ["authorization_code", "refresh_token"],
            response_types: ["code"],
            scope: SCOPE,
            token_endpoint_auth_method: "none",
            application_type: "web",
            dpop_bound_access_tokens: true,
        }
    }
}

/// Every route the server answers, with `site` served as files underneath.
///
/// Nothing here sets `Cache-Control`: production caching is declared in the
/// site's own `_headers`, and a dev server wants none of it.
pub fn router(pool: SqlitePool, site: PathBuf) -> Router {
    Router::new()
        .route("/health", get(health))
        .with_state(pool)
        .fallback_service(ServeDir::new(site))
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
