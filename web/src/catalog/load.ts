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
  const current = await readManifest();
  const manifest = current.manifest;

  step(`Loading ${manifest.cards.rows.toLocaleString()} cards`);
  const [cards, prints] = await Promise.all([
    file(manifest.cards.name),
    file(manifest.prints.name),
  ]);

  step("Indexing");
  const catalog = new Catalog(parse(cards.bytes), parse(prints.bytes));

  // Cached only now the pair it names is, or a later offline load would read a
  // manifest pointing at files this device never fetched.
  if (current.fresh) await write(MANIFEST, current.bytes);
  await prune([manifest.cards.name, manifest.prints.name]);

  return { catalog, manifest, cached: cards.cached && prints.cached };
}

// The published manifest, from the network only: a cached one can't be news.
// Deliberately does not cache what it finds — see `load`.
export async function latest(): Promise<Manifest> {
  return parse<Manifest>(await fetchFile(MANIFEST, true));
}

// Two manifests name the same catalog, which the version alone doesn't answer:
// a rebuild of the same Scryfall file can order printings differently and so
// produce different bytes, which is exactly what the filenames are for.
export function same(a: Manifest, b: Manifest): boolean {
  return a.cards.name === b.cards.name && a.prints.name === b.prints.name;
}

function parse<T>(bytes: ArrayBuffer): T {
  return JSON.parse(new TextDecoder().decode(bytes)) as T;
}

async function fetchFile(
  name: string,
  revalidate = false,
): Promise<ArrayBuffer> {
  const at = new URL(name, `${CATALOG}/`);
  const response = await fetch(at, revalidate ? { cache: "no-cache" } : {});
  if (!response.ok) {
    throw new Error(`${at}: ${response.status} ${response.statusText}`);
  }
  return await response.arrayBuffer();
}

// The manifest is the one file that changes under its own name, so it comes
// from the network when there is one and from the cache when there isn't.
async function readManifest(): Promise<{
  manifest: Manifest;
  bytes: ArrayBuffer;
  fresh: boolean;
}> {
  try {
    const bytes = await fetchFile(MANIFEST, true);
    return { manifest: parse<Manifest>(bytes), bytes, fresh: true };
  } catch (error) {
    const bytes = await read(MANIFEST);
    if (!bytes) throw error;
    return { manifest: parse<Manifest>(bytes), bytes, fresh: false };
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
