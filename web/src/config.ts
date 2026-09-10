// Two origins because there are two cadences: `docs/architecture.md`.
// Dev takes the page's own host, so a phone on the LAN reaches the laptop.
export const CATALOG = import.meta.env.DEV
  ? `http://${location.hostname}:8080`
  : "https://static.manaweb.app";
