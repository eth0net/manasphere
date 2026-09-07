//! The Manasphere server: it keeps the card cache fresh and generates the
//! static site built from it.
//!
//! That site — the app, the catalog artifact and the OAuth client metadata
//! document — is deployed to a CDN, so in production this process serves none
//! of it. It serves the directory anyway, because developing the client wants
//! something local to fetch from. There are no write handlers: user data lives
//! in the user's own PDS and the browser writes there directly. See
//! `docs/architecture.md`.
//!
//! Configured entirely from the environment:
//!
//! | Variable | Default |
//! |---|---|
//! | `MANASPHERE_DATABASE` | `manasphere.db` |
//! | `MANASPHERE_SITE` | `site` |
//! | `MANASPHERE_BIND` | `127.0.0.1:8080` |
//! | `MANASPHERE_PUBLIC_URL` | `http://localhost:8080` |
//! | `MANASPHERE_SYNC` | `1` |

use std::error::Error;
use std::net::SocketAddr;
use std::path::{Path, PathBuf};
use std::time::Duration;
use std::{env, process};

use manasphere_api::Config;
use manasphere_core::{cards, catalog};
use manasphere_scryfall::{BulkKind, Client};
use sqlx::SqlitePool;
use tokio::fs;
use tokio::net::TcpListener;
use tokio::time::{MissedTickBehavior, interval};
use tower_http::trace::TraceLayer;
use tracing_subscriber::EnvFilter;

/// Scryfall asks for gameplay data no more than once a week.
const REFRESH: Duration = Duration::from_hours(7 * 24);

/// Cache rules for the generated site, read by Cloudflare Pages.
///
/// The patterns must not overlap: Pages gives a request the headers of every
/// rule that matches and joins same-named ones with a comma, so a manifest
/// caught by the immutable rule would be told `immutable, no-cache`.
const HEADERS: &str = "\
/catalog/files/*
  Cache-Control: public, max-age=31536000, immutable

/catalog/manifest.json
  Cache-Control: no-cache

/oauth/client-metadata.json
  Cache-Control: public, max-age=3600
";

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

    // Configuration alone decides these, so they are written before any sync
    // and are right even on an empty cache.
    write_static(&settings).await?;

    // A restart shouldn't wait on a sync, so the catalog comes from whatever
    // the cache already holds.
    match export(&pool, &settings.catalog()).await {
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
        site = %settings.site.display(),
        public = %settings.public_url,
        "listening"
    );
    axum::serve(
        listener,
        manasphere_api::router(pool, settings.site).layer(TraceLayer::new_for_http()),
    )
    .with_graceful_shutdown(shutdown())
    .await?;

    Ok(())
}

/// Writes the parts of the site that don't come from the cache.
async fn write_static(settings: &Settings) -> Result<(), Box<dyn Error>> {
    let oauth = settings.site.join("oauth");
    fs::create_dir_all(&oauth).await?;
    fs::write(
        oauth.join("client-metadata.json"),
        manasphere_api::client_metadata(&Config {
            public_url: settings.public_url.clone(),
        })?,
    )
    .await?;
    fs::write(settings.site.join("_headers"), HEADERS).await?;
    Ok(())
}

/// Builds the catalog from the cache and writes it into the site.
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
    let client = match Client::new(&settings.user_agent()) {
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
            // The previous catalog is still on the CDN, so a failed refresh is
            // a warning rather than a reason to stop.
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

    export(pool, &settings.catalog()).await?;

    Ok(())
}

#[derive(Debug, Clone)]
struct Settings {
    database: String,
    /// The generated site: what gets deployed, and what the dev server serves.
    site: PathBuf,
    bind: SocketAddr,
    public_url: String,
    sync: bool,
}

impl Settings {
    fn from_env() -> Result<Self, Box<dyn Error>> {
        let bind = var("MANASPHERE_BIND", "127.0.0.1:8080");
        Ok(Self {
            database: var("MANASPHERE_DATABASE", "manasphere.db"),
            site: PathBuf::from(var("MANASPHERE_SITE", "site")),
            bind: bind
                .parse()
                .map_err(|_| format!("MANASPHERE_BIND: {bind}"))?,
            // The OAuth client_id is built from this, so a trailing slash
            // would make the document disagree with its own URL.
            public_url: var("MANASPHERE_PUBLIC_URL", "http://localhost:8080")
                .trim_end_matches('/')
                .to_owned(),
            sync: !matches!(var("MANASPHERE_SYNC", "1").as_str(), "0" | "false"),
        })
    }

    fn catalog(&self) -> PathBuf {
        self.site.join("catalog")
    }

    /// Scryfall's terms require a user agent naming the app, so it carries the
    /// deployment rather than a library default.
    fn user_agent(&self) -> String {
        format!(
            "Manasphere/{} (+{})",
            env!("CARGO_PKG_VERSION"),
            self.public_url
        )
    }
}

fn var(name: &str, default: &str) -> String {
    env::var(name).unwrap_or_else(|_| default.to_owned())
}
