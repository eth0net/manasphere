//! The Manasphere server: one process that keeps the card cache fresh and
//! serves the catalogue and the OAuth client metadata document.
//!
//! It has no write handlers. User data lives in the user's own PDS and the
//! browser writes there directly — see `docs/architecture.md`.
//!
//! Configured entirely from the environment:
//!
//! | Variable | Default |
//! |---|---|
//! | `MANASPHERE_DATABASE` | `manasphere.db` |
//! | `MANASPHERE_BIND` | `127.0.0.1:8080` |
//! | `MANASPHERE_PUBLIC_URL` | `http://localhost:8080` |
//! | `MANASPHERE_SYNC` | `1` |

use std::error::Error;
use std::net::SocketAddr;
use std::sync::Arc;
use std::time::Duration;
use std::{env, process};

use manasphere_api::{AppState, Config};
use manasphere_core::{cards, catalog};
use manasphere_scryfall::{BulkKind, Client};
use sqlx::SqlitePool;
use tokio::net::TcpListener;
use tokio::time::{MissedTickBehavior, interval};
use tower_http::trace::TraceLayer;
use tracing_subscriber::EnvFilter;

/// Scryfall asks for gameplay data no more than once a week.
const REFRESH: Duration = Duration::from_hours(7 * 24);

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
    let state = Arc::new(AppState::new(&Config {
        public_url: settings.public_url.clone(),
    })?);

    // A restart shouldn't wait on a sync to start serving, so the catalogue
    // comes from whatever the cache already holds.
    match catalog::build(&pool).await {
        Ok(built) => {
            tracing::info!(version = %built.version, "serving the catalogue");
            state.publish(built);
        }
        Err(error) => tracing::warn!("no catalogue yet: {error}"),
    }

    if settings.sync {
        tokio::spawn(refresh_weekly(
            pool,
            Arc::clone(&state),
            settings.user_agent(),
        ));
    } else {
        tracing::info!("sync disabled");
    }

    let listener = TcpListener::bind(settings.bind).await?;
    tracing::info!(bind = %settings.bind, public = %settings.public_url, "listening");
    axum::serve(
        listener,
        manasphere_api::router(state).layer(TraceLayer::new_for_http()),
    )
    .with_graceful_shutdown(shutdown())
    .await?;

    Ok(())
}

async fn shutdown() {
    if let Err(error) = tokio::signal::ctrl_c().await {
        tracing::error!("could not listen for shutdown: {error}");
    }
}

/// Checks the bulk index now and weekly after, syncing when the file has
/// changed and republishing the catalogue when it has.
async fn refresh_weekly(pool: SqlitePool, state: Arc<AppState>, user_agent: String) {
    let client = match Client::new(&user_agent) {
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
        if let Err(error) = refresh(&pool, &state, &client).await {
            // The previous catalogue is still being served, so a failed
            // refresh is a warning rather than a reason to stop.
            tracing::error!("refresh failed: {error}");
        }
    }
}

async fn refresh(
    pool: &SqlitePool,
    state: &AppState,
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

    let built = catalog::build(pool).await?;
    tracing::info!(
        cards = built.cards.rows,
        prints = built.prints.rows,
        bytes = built.cards.gzip.len() + built.prints.gzip.len(),
        "catalogue rebuilt"
    );
    state.publish(built);

    Ok(())
}

#[derive(Debug)]
struct Settings {
    database: String,
    bind: SocketAddr,
    public_url: String,
    sync: bool,
}

impl Settings {
    fn from_env() -> Result<Self, Box<dyn Error>> {
        let bind = var("MANASPHERE_BIND", "127.0.0.1:8080");
        Ok(Self {
            database: var("MANASPHERE_DATABASE", "manasphere.db"),
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
