//! Syncs the card cache from Scryfall's Default Cards file.
//!
//! ```sh
//! cargo run --release -p manasphere-core --example sync -- cards.db
//! # or from a copy already on disk, to leave a free service alone:
//! cargo run --release -p manasphere-core --example sync -- cards.db default-cards.jsonl.gz
//! ```

use std::env;
use std::error::Error;
use std::time::Instant;

use manasphere_core::cards::{self, Search};
use manasphere_core::open;
use manasphere_scryfall::{BulkKind, CardStream, Client};
use tokio::fs::File;

#[tokio::main]
async fn main() -> Result<(), Box<dyn Error>> {
    let mut args = env::args().skip(1);
    let db = args.next().unwrap_or_else(|| "cards.db".to_owned());
    let local = args.next();

    let pool = open(&db).await?;
    let client = Client::new("Manasphere/0.1 (+https://manasphere.app)")?;

    // The index is 3KB, so it's cheap even when the file is already on disk.
    let bulk = client.bulk_data(BulkKind::DefaultCards).await?;
    if cards::last_synced(&pool, &bulk.kind).await?.as_deref() == Some(&bulk.updated_at) {
        println!("{} is already synced ({})", bulk.name, bulk.updated_at);
        return Ok(());
    }

    let mut stream = if let Some(path) = &local {
        println!("reading {path}");
        CardStream::gzipped(File::open(path).await?)
    } else {
        println!("downloading {}", bulk.jsonl_download_uri);
        client.download(&bulk).await?
    };

    let started = Instant::now();
    let report = cards::replace(&pool, &bulk, &mut stream).await?;
    println!(
        "wrote {} cards, skipped {}, in {:.1}s",
        report.written,
        report.skipped,
        started.elapsed().as_secs_f64(),
    );

    println!("cache holds {} printings", cards::count(&pool).await?);
    for hit in cards::search(
        &pool,
        "lightning bolt",
        Search {
            limit: 3,
            ..Search::default()
        },
    )
    .await?
    {
        println!(
            "  {} {} #{} ({})",
            hit.name, hit.set_code, hit.collector_number, hit.lang
        );
    }

    Ok(())
}
