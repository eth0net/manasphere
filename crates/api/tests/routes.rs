//! Routes, headers and caching. What the artifact contains is tested in
//! `manasphere-core`.

use std::sync::Arc;

use axum::body::{Body, to_bytes};
use axum::http::header::{ACCEPT_ENCODING, CACHE_CONTROL, CONTENT_ENCODING, ETAG, IF_NONE_MATCH};
use axum::http::{Request, Response, StatusCode};
use manasphere_api::{AppState, Config};
use manasphere_core::catalog::{Artifact, Catalog};
use serde_json::Value;
use tower::ServiceExt as _;

const PUBLIC_URL: &str = "https://manasphere.app";

/// Stands in for a built file: the handlers only use the name, the etag and
/// the bytes.
fn artifact(kind: &str, hash: &str) -> Artifact {
    Artifact {
        name: format!("{kind}.{hash}.json"),
        etag: format!("\"{hash}\""),
        rows: 2,
        gzip: format!("pretend this is gzipped {kind}").into_bytes(),
    }
}

fn catalog() -> Catalog {
    Catalog {
        version: "2026-09-06T21:05:43.673+00:00".to_owned(),
        cards: artifact("cards", "1111111111111111"),
        prints: artifact("prints", "2222222222222222"),
    }
}

fn state(published: bool) -> Arc<AppState> {
    let state = Arc::new(
        AppState::new(&Config {
            public_url: PUBLIC_URL.to_owned(),
        })
        .expect("client metadata should serialize"),
    );
    if published {
        state.publish(catalog());
    }
    state
}

async fn get(state: &Arc<AppState>, path: &str) -> Response<Body> {
    request(state, Request::get(path).body(Body::empty()).unwrap()).await
}

async fn request(state: &Arc<AppState>, request: Request<Body>) -> Response<Body> {
    manasphere_api::router(Arc::clone(state))
        .oneshot(request)
        .await
        .expect("routing is infallible")
}

async fn json(response: Response<Body>) -> Value {
    let body = to_bytes(response.into_body(), usize::MAX).await.unwrap();
    serde_json::from_slice(&body).expect("the response should be JSON")
}

#[tokio::test]
async fn nothing_is_served_before_the_first_sync() {
    let state = state(false);

    for path in [
        "/catalog/manifest.json",
        "/catalog/cards.1111111111111111.json",
    ] {
        let response = get(&state, path).await;
        assert_eq!(response.status(), StatusCode::SERVICE_UNAVAILABLE, "{path}");
    }

    let health = json(get(&state, "/health").await).await;
    assert_eq!(health["catalog"], Value::Null);
}

#[tokio::test]
async fn the_manifest_names_both_files() {
    let state = state(true);
    let manifest = json(get(&state, "/catalog/manifest.json").await).await;

    assert_eq!(manifest["version"], "2026-09-06T21:05:43.673+00:00");
    assert_eq!(
        manifest["cards"]["path"],
        "/catalog/cards.1111111111111111.json"
    );
    assert_eq!(manifest["prints"]["rows"], 2);

    // The path it names has to be the path that answers.
    let path = manifest["prints"]["path"].as_str().unwrap();
    assert_eq!(get(&state, path).await.status(), StatusCode::OK);
}

#[tokio::test]
async fn a_catalog_file_is_gzip_encoded_and_immutable() {
    let response = get(&state(true), "/catalog/prints.2222222222222222.json").await;

    assert_eq!(response.status(), StatusCode::OK);
    let headers = response.headers();
    assert_eq!(headers[CONTENT_ENCODING], "gzip");
    assert_eq!(headers[ETAG], "\"2222222222222222\"");
    assert!(
        headers[CACHE_CONTROL]
            .to_str()
            .unwrap()
            .contains("immutable")
    );
}

#[tokio::test]
async fn a_client_that_already_has_the_bytes_gets_a_304() {
    let state = state(true);

    for path in [
        "/catalog/cards.1111111111111111.json",
        "/catalog/manifest.json",
    ] {
        let response = request(
            &state,
            Request::get(path)
                .header(IF_NONE_MATCH, "\"1111111111111111\"")
                .body(Body::empty())
                .unwrap(),
        )
        .await;
        assert_eq!(response.status(), StatusCode::NOT_MODIFIED, "{path}");
    }
}

#[tokio::test]
async fn refusing_gzip_is_refused_rather_than_answered_uncompressed() {
    let response = request(
        &state(true),
        Request::get("/catalog/cards.1111111111111111.json")
            .header(ACCEPT_ENCODING, "identity")
            .body(Body::empty())
            .unwrap(),
    )
    .await;
    assert_eq!(response.status(), StatusCode::NOT_ACCEPTABLE);
}

#[tokio::test]
async fn a_stale_catalog_path_is_not_found() {
    let response = get(&state(true), "/catalog/cards.0000000000000000.json").await;
    assert_eq!(response.status(), StatusCode::NOT_FOUND);
}

/// The document has to be served at the `client_id` it declares, or
/// authorization fails at the PDS rather than here.
#[tokio::test]
async fn the_client_metadata_is_served_at_the_client_id_it_declares() {
    let state = state(false);
    let metadata = json(get(&state, "/oauth/client-metadata.json").await).await;

    assert_eq!(
        metadata["client_id"],
        format!("{PUBLIC_URL}/oauth/client-metadata.json")
    );
    assert_eq!(metadata["token_endpoint_auth_method"], "none");
    assert_eq!(metadata["dpop_bound_access_tokens"], true);

    let scope = metadata["scope"].as_str().unwrap();
    assert!(
        scope.starts_with("atproto"),
        "atproto is mandatory: {scope}"
    );
    assert!(scope.contains("repo:app.manasphere.card"));
}
