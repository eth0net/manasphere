// Two origins because there are two cadences: `docs/architecture.md`.
export const CATALOG = import.meta.env.DEV
  ? "http://127.0.0.1:8080"
  : "https://static.manasphere.app";
