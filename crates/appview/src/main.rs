//! The Manasphere server: it keeps the card cache fresh and exports the
//! catalog built from it.
//!
//! Nothing here is browser-facing in production: the catalog is uploaded to
//! object storage on its own origin and the app deploys from the repo. The
//! export directory is served for local development. No write handlers, ever:
//! user data lives in the user's own PDS and the browser writes there
//! directly. See `docs/architecture.md`.
//!
//! Configured entirely from the environment:
//!
//! | Variable | Default |
//! |---|---|
//! | `MANASPHERE_DATABASE` | `manasphere.db` |
//! | `MANASPHERE_CATALOG` | `catalog` |
//! | `MANASPHERE_BIND` | `127.0.0.1:8080` |
//! | `MANASPHERE_SYNC` | `1` |

use std::error::Error;
use std::net::SocketAddr;
use std::path::{Path, PathBuf};
use std::time::Duration;
use std::{env, process};

use manasphere_core::{cards, catalog};
use manasphere_scryfall::{BulkKind, Client};
use sqlx::SqlitePool;
use tokio::net::TcpListener;
use tokio::time::{MissedTickBehavior, interval};
use tower_http::trace::TraceLayer;
use tracing_subscriber::EnvFilter;

/// Scryfall asks for gameplay data no more than once a week.
const REFRESH: Duration = Duration::from_hours(7 * 24);

/// Scryfall's terms require a user agent of the app's own, not a library's.
const USER_AGENT: &str = concat!(
    "Manasphere/",
    env!("CARGO_PKG_VERSION"),
    " (+https://manasphere.app)"
);

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt()
        .with_env_filter(
            EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("info")),
        )
        .init();

    if let Err(error) = run().await {
        tracing::error!("{error}");
        process::exit(1);
    }
}

async fn run() -> Result<(), Box<dyn Error>> {
    let settings = Settings::from_env()?;
    let pool = manasphere_core::open(&settings.database).await?;

    // A restart shouldn't wait on a sync, so the catalog comes from whatever
    // the cache already holds.
    match export(&pool, &settings.catalog).await {
        Ok(version) => tracing::info!(%version, "catalog written"),
        Err(error) => tracing::warn!("no catalog yet: {error}"),
    }

    if settings.sync {
        tokio::spawn(refresh_weekly(pool.clone(), settings.clone()));
    } else {
        tracing::info!("sync disabled");
    }

    let listener = TcpListener::bind(settings.bind).await?;
    tracing::info!(
        bind = %settings.bind,
        catalog = %settings.catalog.display(),
        "listening"
    );
    axum::serve(
        listener,
        manasphere_api::router(pool, settings.catalog).layer(TraceLayer::new_for_http()),
    )
    .with_graceful_shutdown(shutdown())
    .await?;

    Ok(())
}

/// Builds the catalog from the cache and writes it out for upload.
async fn export(pool: &SqlitePool, dir: &Path) -> manasphere_core::Result<String> {
    let built = catalog::build(pool).await?;
    built.write(dir).await?;
    tracing::info!(
        cards = built.cards.rows,
        prints = built.prints.rows,
        bytes = built.cards.json.len() + built.prints.json.len(),
        "catalog built"
    );
    Ok(built.version)
}

async fn shutdown() {
    if let Err(error) = tokio::signal::ctrl_c().await {
        tracing::error!("could not listen for shutdown: {error}");
    }
}

/// Checks the bulk index now and weekly after, syncing when the file has
/// changed and republishing the catalog when it has.
async fn refresh_weekly(pool: SqlitePool, settings: Settings) {
    let client = match Client::new(USER_AGENT) {
        Ok(client) => client,
        Err(error) => {
            tracing::error!("no Scryfall client, so no sync: {error}");
            return;
        }
    };

    let mut ticker = interval(REFRESH);
    ticker.set_missed_tick_behavior(MissedTickBehavior::Delay);
    loop {
        ticker.tick().await;
        if let Err(error) = refresh(&pool, &settings, &client).await {
            // The uploaded catalog is untouched, so a failed refresh is a
            // warning rather than a reason to stop.
            tracing::error!("refresh failed: {error}");
        }
    }
}

async fn refresh(
    pool: &SqlitePool,
    settings: &Settings,
    client: &Client,
) -> Result<(), Box<dyn Error>> {
    let bulk = client.bulk_data(BulkKind::DefaultCards).await?;
    if cards::last_synced(pool, &bulk.kind).await?.as_deref() == Some(&bulk.updated_at) {
        tracing::info!(version = %bulk.updated_at, "cache is current");
        return Ok(());
    }

    tracing::info!(version = %bulk.updated_at, size = bulk.compressed_size, "syncing");
    let mut stream = client.download(&bulk).await?;
    let report = cards::replace(pool, &bulk, &mut stream).await?;
    tracing::info!(
        printings = report.written,
        cards = report.cards,
        skipped = report.skipped,
        "synced"
    );

    export(pool, &settings.catalog).await?;

    Ok(())
}

#[derive(Debug, Clone)]
struct Settings {
    database: String,
    /// Where the catalog is written: what gets uploaded, and what the dev
    /// server serves.
    catalog: PathBuf,
    bind: SocketAddr,
    sync: bool,
}

impl Settings {
    fn from_env() -> Result<Self, Box<dyn Error>> {
        let bind = var("MANASPHERE_BIND", "127.0.0.1:8080");
        Ok(Self {
            database: var("MANASPHERE_DATABASE", "manasphere.db"),
            catalog: PathBuf::from(var("MANASPHERE_CATALOG", "catalog")),
            bind: bind
                .parse()
                .map_err(|_| format!("MANASPHERE_BIND: {bind}"))?,
            sync: !matches!(var("MANASPHERE_SYNC", "1").as_str(), "0" | "false"),
        })
    }
}

fn var(name: &str, default: &str) -> String {
    env::var(name).unwrap_or_else(|_| default.to_owned())
}
