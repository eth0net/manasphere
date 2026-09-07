#[derive(Debug, thiserror::Error)]
#[non_exhaustive]
pub enum Error {
    #[error("database error")]
    Sqlx(#[from] sqlx::Error),

    #[error("applying migrations failed")]
    Migrate(#[from] sqlx::migrate::MigrateError),

    #[error("reading the card stream failed")]
    Scryfall(#[from] manasphere_scryfall::Error),

    /// A full replace that wrote nothing would empty the catalogue, so the
    /// transaction rolls back instead.
    #[error("the card stream yielded no usable cards, so nothing was replaced")]
    EmptySync,
}
