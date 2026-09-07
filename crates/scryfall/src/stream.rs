use std::fmt;

use async_compression::tokio::bufread::GzipDecoder;
use tokio::io::{AsyncBufRead, AsyncBufReadExt as _, AsyncRead, BufReader, Lines};

use crate::{Card, Error, Result};

/// A newline-delimited JSON card file, read a line at a time.
///
/// Default Cards is ~78MB compressed and several times that decompressed, so it
/// is never held whole.
pub struct CardStream {
    lines: Lines<Box<dyn AsyncBufRead + Send + Unpin>>,
    line: u64,
}

impl CardStream {
    /// Reads already-decompressed NDJSON.
    #[must_use]
    pub fn new<R: AsyncBufRead + Send + Unpin + 'static>(reader: R) -> Self {
        let reader: Box<dyn AsyncBufRead + Send + Unpin> = Box::new(reader);
        Self {
            lines: reader.lines(),
            line: 0,
        }
    }

    /// Reads the gzip that Scryfall serves.
    ///
    /// Multi-member, so a concatenated file decodes whole rather than stopping
    /// silently at the end of the first member.
    #[must_use]
    pub fn gzipped<R: AsyncRead + Send + Unpin + 'static>(reader: R) -> Self {
        let mut gzip = GzipDecoder::new(BufReader::new(reader));
        gzip.multiple_members(true);
        Self::new(BufReader::new(gzip))
    }

    /// The next card, or `None` at end of file.
    ///
    /// # Errors
    ///
    /// Fails on an unreadable stream, or on a line that isn't a card object.
    /// The error names the line, and the stream can be polled again to skip it.
    pub async fn try_next(&mut self) -> Result<Option<Card>> {
        loop {
            let Some(line) = self.lines.next_line().await? else {
                return Ok(None);
            };
            self.line += 1;
            if line.trim().is_empty() {
                continue;
            }
            return serde_json::from_str(&line)
                .map(Some)
                .map_err(|source| Error::Parse {
                    line: self.line,
                    source,
                });
        }
    }

    /// Lines consumed so far, for progress reporting.
    #[must_use]
    pub fn line(&self) -> u64 {
        self.line
    }
}

impl fmt::Debug for CardStream {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_struct("CardStream")
            .field("line", &self.line)
            .finish_non_exhaustive()
    }
}
