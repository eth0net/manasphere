//! HTTP handlers.
//!
//! v0 serves three things: the catalog artifact, the OAuth client metadata
//! document, and a health check. There are no write handlers, and there will
//! not be — the browser writes to the user's own PDS. See
//! `docs/architecture.md`.

use std::sync::{Arc, PoisonError, RwLock};

use axum::Router;
use axum::body::Bytes;
use axum::extract::{Path, State};
use axum::http::header::{
    ACCEPT_ENCODING, CACHE_CONTROL, CONTENT_ENCODING, CONTENT_TYPE, ETAG, IF_NONE_MATCH,
};
use axum::http::{HeaderMap, StatusCode};
use axum::response::{IntoResponse, Response};
use axum::routing::get;
use manasphere_core::catalog::{Artifact, Catalog};
use serde::Serialize;

const JSON: &str = "application/json";

/// Catalog files are named after their own content, so a client that has one
/// never needs to ask about it again.
const IMMUTABLE: &str = "public, max-age=31536000, immutable";

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

/// What the handlers share.
#[derive(Debug)]
pub struct AppState {
    /// Absent until the first sync completes.
    published: RwLock<Option<Arc<Published>>>,
    client_metadata: Vec<u8>,
}

impl AppState {
    /// # Errors
    ///
    /// Fails if the client metadata document won't serialize.
    pub fn new(config: &Config) -> serde_json::Result<Self> {
        Ok(Self {
            published: RwLock::new(None),
            client_metadata: serde_json::to_vec_pretty(&ClientMetadata::new(&config.public_url))?,
        })
    }

    /// Swaps in a freshly built catalog.
    pub fn publish(&self, catalog: Catalog) {
        // The lock guards one Arc swap, so poisoning it can't leave a
        // half-written catalog and recovering from it loses nothing.
        *self
            .published
            .write()
            .unwrap_or_else(PoisonError::into_inner) = Some(Arc::new(Published::new(catalog)));
    }

    fn published(&self) -> Option<Arc<Published>> {
        self.published
            .read()
            .unwrap_or_else(PoisonError::into_inner)
            .clone()
    }
}

/// A catalog with its manifest rendered and its bodies refcounted. All of it
/// changes together.
#[derive(Debug)]
struct Published {
    version: String,
    manifest: Bytes,
    etag: String,
    files: [File; 2],
}

#[derive(Debug)]
struct File {
    name: String,
    etag: String,
    body: Bytes,
}

impl From<Artifact> for File {
    fn from(artifact: Artifact) -> Self {
        Self {
            name: artifact.name,
            etag: artifact.etag,
            body: Bytes::from(artifact.gzip),
        }
    }
}

impl Published {
    fn new(catalog: Catalog) -> Self {
        let manifest = serde_json::to_vec(&Manifest {
            version: &catalog.version,
            cards: Entry::new(&catalog.cards),
            prints: Entry::new(&catalog.prints),
        })
        .expect("the manifest is plain data");

        let Catalog {
            version,
            cards,
            prints,
        } = catalog;

        Self {
            version,
            manifest: Bytes::from(manifest),
            // Both files change together, so either hash identifies the pair.
            etag: cards.etag.clone(),
            files: [cards.into(), prints.into()],
        }
    }
}

/// What a client fetches first: the paths of the current pair.
#[derive(Debug, Serialize)]
struct Manifest<'a> {
    version: &'a str,
    cards: Entry<'a>,
    prints: Entry<'a>,
}

#[derive(Debug, Serialize)]
struct Entry<'a> {
    path: String,
    rows: usize,
    /// Compressed, which is how it is served.
    bytes: usize,
    etag: &'a str,
}

impl<'a> Entry<'a> {
    fn new(artifact: &'a Artifact) -> Self {
        Self {
            path: format!("/catalog/{}", artifact.name),
            rows: artifact.rows,
            bytes: artifact.gzip.len(),
            etag: &artifact.etag,
        }
    }
}

/// The OAuth client metadata document, served at its own `client_id`.
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

/// Every route the server answers.
pub fn router(state: Arc<AppState>) -> Router {
    Router::new()
        .route("/health", get(health))
        .route("/oauth/client-metadata.json", get(client_metadata))
        .route("/catalog/manifest.json", get(manifest))
        .route("/catalog/{file}", get(catalog_file))
        .with_state(state)
}

#[derive(Debug, Serialize)]
struct Health {
    /// The bulk file the served catalog was built from, absent before the
    /// first sync finishes.
    catalog: Option<String>,
}

async fn health(State(state): State<Arc<AppState>>) -> Response {
    let catalog = state.published().map(|published| published.version.clone());
    let body = serde_json::to_vec(&Health { catalog }).expect("plain data");
    json(StatusCode::OK, "no-store", Bytes::from(body))
}

async fn client_metadata(State(state): State<Arc<AppState>>) -> Response {
    json(
        StatusCode::OK,
        "public, max-age=3600",
        Bytes::from(state.client_metadata.clone()),
    )
}

async fn manifest(State(state): State<Arc<AppState>>, headers: HeaderMap) -> Response {
    let Some(published) = state.published() else {
        return unavailable();
    };
    if unchanged(&headers, &published.etag) {
        return not_modified(&published.etag);
    }

    (
        [
            (CONTENT_TYPE, JSON),
            // Small, and the paths it names change weekly, so it is the one
            // catalog response a client has to revalidate.
            (CACHE_CONTROL, "no-cache"),
            (ETAG, published.etag.as_str()),
        ],
        published.manifest.clone(),
    )
        .into_response()
}

async fn catalog_file(
    State(state): State<Arc<AppState>>,
    Path(name): Path<String>,
    headers: HeaderMap,
) -> Response {
    let Some(published) = state.published() else {
        return unavailable();
    };
    let Some(file) = published.files.iter().find(|file| file.name == name) else {
        return (StatusCode::NOT_FOUND, "no such catalog file\n").into_response();
    };
    if unchanged(&headers, &file.etag) {
        return not_modified(&file.etag);
    }
    if !accepts_gzip(&headers) {
        // Stored gzipped and served as-is: decompressing on demand would hand
        // a caller several megabytes of work per request.
        return (
            StatusCode::NOT_ACCEPTABLE,
            "the catalog is only served gzip-encoded\n",
        )
            .into_response();
    }

    (
        [
            (CONTENT_TYPE, JSON),
            (CONTENT_ENCODING, "gzip"),
            (CACHE_CONTROL, IMMUTABLE),
            (ETAG, file.etag.as_str()),
        ],
        file.body.clone(),
    )
        .into_response()
}

fn json(status: StatusCode, cache: &'static str, body: Bytes) -> Response {
    (status, [(CONTENT_TYPE, JSON), (CACHE_CONTROL, cache)], body).into_response()
}

fn unavailable() -> Response {
    (
        StatusCode::SERVICE_UNAVAILABLE,
        [(CACHE_CONTROL, "no-store")],
        "the catalog has not been built yet\n",
    )
        .into_response()
}

fn not_modified(etag: &str) -> Response {
    (StatusCode::NOT_MODIFIED, [(ETAG, etag)]).into_response()
}

/// Whether the client already holds this exact body. `*` matches anything, and
/// a list is compared entry by entry rather than as one string.
fn unchanged(headers: &HeaderMap, etag: &str) -> bool {
    headers
        .get(IF_NONE_MATCH)
        .and_then(|value| value.to_str().ok())
        .is_some_and(|value| {
            value
                .split(',')
                .any(|candidate| candidate.trim() == etag || candidate.trim() == "*")
        })
}

/// An absent header means anything is acceptable. Weights aren't parsed — no
/// browser refuses gzip, and the cost of getting it wrong is a 406.
fn accepts_gzip(headers: &HeaderMap) -> bool {
    let Some(accept) = headers.get(ACCEPT_ENCODING) else {
        return true;
    };
    accept
        .to_str()
        .is_ok_and(|value| value.contains("gzip") || value.contains('*'))
}
