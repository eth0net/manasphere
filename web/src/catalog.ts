import { CATALOG } from "./config";

// One file of the pair. `name` resolves against the manifest's own URL, so
// the catalog can move origin without the format changing.
export interface Entry {
  name: string;
  rows: number;
  bytes: number;
}

// What a client fetches first, and the only part it re-fetches: the artifact
// files are content-addressed and immutable.
export interface Manifest {
  version: string;
  cards: Entry;
  prints: Entry;
}

export async function manifest(): Promise<Manifest> {
  const url = new URL("manifest.json", `${CATALOG}/`);
  const response = await fetch(url, { cache: "no-cache" });
  if (!response.ok) {
    throw new Error(`${url}: ${response.status} ${response.statusText}`);
  }
  return (await response.json()) as Manifest;
}
