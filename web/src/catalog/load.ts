import { CATALOG } from "../config";
import { Catalog, type Manifest } from ".";
import { MANIFEST, prune, read, write } from "./store";

export interface Loaded {
  catalog: Catalog;
  manifest: Manifest;
  // Whether the artifact came off disk rather than the network, which is what
  // makes a second visit instant and an offline one work at all.
  cached: boolean;
}

// Reads the catalog, from the cache where it can and the network where it
// can't, reporting each step because the first load is megabytes.
export async function load(step: (of: string) => void): Promise<Loaded> {
  step("Reading the manifest");
  const manifest = await readManifest();

  step(`Loading ${manifest.cards.rows.toLocaleString()} cards`);
  const [cards, prints] = await Promise.all([
    file(manifest.cards.name),
    file(manifest.prints.name),
  ]);

  step("Indexing");
  const catalog = new Catalog(parse(cards.bytes), parse(prints.bytes));

  await prune([manifest.cards.name, manifest.prints.name]);
  return { catalog, manifest, cached: cards.cached && prints.cached };
}

function parse<T>(bytes: ArrayBuffer): T {
  return JSON.parse(new TextDecoder().decode(bytes)) as T;
}

function url(name: string): URL {
  return new URL(name, `${CATALOG}/`);
}

async function fetchFile(name: string): Promise<ArrayBuffer> {
  const at = url(name);
  const response = await fetch(
    at,
    name === MANIFEST ? { cache: "no-cache" } : {},
  );
  if (!response.ok) {
    throw new Error(`${at}: ${response.status} ${response.statusText}`);
  }
  return await response.arrayBuffer();
}

// The manifest is the one file that changes under its own name, so it comes
// from the network when there is one and from the cache when there isn't.
async function readManifest(): Promise<Manifest> {
  try {
    const bytes = await fetchFile(MANIFEST);
    await write(MANIFEST, bytes);
    return parse<Manifest>(bytes);
  } catch (error) {
    const bytes = await read(MANIFEST);
    if (!bytes) throw error;
    return parse<Manifest>(bytes);
  }
}

// Content-addressed, so a cached file under this name is the right one and
// needs no revalidating.
async function file(
  name: string,
): Promise<{ bytes: ArrayBuffer; cached: boolean }> {
  const cached = await read(name);
  if (cached) return { bytes: cached, cached: true };

  const bytes = await fetchFile(name);
  await write(name, bytes);
  return { bytes, cached: false };
}
