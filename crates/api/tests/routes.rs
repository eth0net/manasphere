//! The two things left in the server: the health check, and serving the
//! generated site so the client can be developed against it.

use std::path::PathBuf;
use std::{env, fs};

use axum::body::{Body, to_bytes};
use axum::http::{Request, Response, StatusCode};
use manasphere_api::Config;
use serde_json::Value;
use tower::ServiceExt as _;

const PUBLIC_URL: &str = "https://manasphere.app";

fn config() -> Config {
    Config {
        public_url: PUBLIC_URL.to_owned(),
    }
}

/// A directory of its own per test, since `ServeDir` needs a real one.
fn scratch(name: &str) -> PathBuf {
    let dir = env::temp_dir().join(format!("manasphere-{name}-{}", std::process::id()));
    fs::create_dir_all(&dir).expect("a scratch directory");
    dir
}

async fn get(site: PathBuf, path: &str) -> Response<Body> {
    let pool = manasphere_core::open_memory()
        .await
        .expect("migrations should apply");
    manasphere_api::router(pool, site)
        .oneshot(Request::get(path).body(Body::empty()).unwrap())
        .await
        .expect("routing is infallible")
}

async fn body(response: Response<Body>) -> Vec<u8> {
    to_bytes(response.into_body(), usize::MAX)
        .await
        .unwrap()
        .to_vec()
}

/// The document has to be served at the `client_id` it declares, or
/// authorization fails at the PDS rather than here.
#[test]
fn the_client_metadata_declares_the_url_it_is_written_to() {
    let document = manasphere_api::client_metadata(&config()).expect("should serialize");
    let metadata: Value = serde_json::from_slice(&document).expect("should be JSON");

    assert_eq!(
        metadata["client_id"],
        format!("{PUBLIC_URL}/oauth/client-metadata.json")
    );
    assert_eq!(metadata["client_uri"], PUBLIC_URL);
    assert_eq!(metadata["token_endpoint_auth_method"], "none");
    assert_eq!(metadata["dpop_bound_access_tokens"], true);

    let scope = metadata["scope"].as_str().unwrap();
    assert!(
        scope.starts_with("atproto"),
        "atproto is mandatory: {scope}"
    );
    assert!(scope.contains("repo:app.manasphere.card"));
}

#[tokio::test]
async fn health_reports_an_empty_cache_as_empty() {
    let response = get(scratch("health"), "/health").await;
    assert_eq!(response.status(), StatusCode::OK);

    let health: Value = serde_json::from_slice(&body(response).await).unwrap();
    assert_eq!(health["cache"], Value::Null);
}

#[tokio::test]
async fn the_site_directory_is_served() {
    let site = scratch("site");
    fs::create_dir_all(site.join("catalog")).unwrap();
    fs::write(site.join("catalog/manifest.json"), br#"{"version":"x"}"#).unwrap();

    let response = get(site.clone(), "/catalog/manifest.json").await;
    assert_eq!(response.status(), StatusCode::OK);
    assert_eq!(body(response).await, br#"{"version":"x"}"#);

    let missing = get(site.clone(), "/catalog/files/nothing.json").await;
    assert_eq!(missing.status(), StatusCode::NOT_FOUND);

    fs::remove_dir_all(site).unwrap();
}
