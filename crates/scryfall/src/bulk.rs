use std::fmt;

use serde::Deserialize;
use uuid::Uuid;

/// Scryfall's `/bulk-data` response.
#[derive(Debug, Clone, Deserialize)]
pub struct BulkIndex {
    pub data: Vec<BulkData>,
}

impl BulkIndex {
    #[must_use]
    pub fn get(&self, kind: BulkKind) -> Option<&BulkData> {
        self.data.iter().find(|entry| entry.kind == kind.as_str())
    }
}

/// One file in the index.
#[derive(Debug, Clone, Deserialize)]
pub struct BulkData {
    pub id: Uuid,
    /// A string, not [`BulkKind`] — Scryfall has added types since this was
    /// written and an unknown one shouldn't fail the whole index.
    #[serde(rename = "type")]
    pub kind: String,
    pub name: String,
    /// RFC 3339. Only ever compared for inequality, to decide whether the file
    /// changed since the last sync, so it needs no date library.
    pub updated_at: String,
    pub jsonl_download_uri: String,
    pub compressed_size: u64,
}

/// The files worth asking for by name.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum BulkKind {
    /// One printing per card, English or the only printed language. Manaweb's
    /// catalog source: see `docs/scryfall.md` for why not [`Self::AllCards`].
    DefaultCards,
    /// Every printing in every language, several times the size.
    AllCards,
    /// One printing per oracle id.
    OracleCards,
    UniqueArtwork,
    Rulings,
}

impl BulkKind {
    #[must_use]
    pub fn as_str(self) -> &'static str {
        match self {
            Self::DefaultCards => "default_cards",
            Self::AllCards => "all_cards",
            Self::OracleCards => "oracle_cards",
            Self::UniqueArtwork => "unique_artwork",
            Self::Rulings => "rulings",
        }
    }
}

impl fmt::Display for BulkKind {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(self.as_str())
    }
}
