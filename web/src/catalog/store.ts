// The catalog cached as the bytes that came off the wire.
//
// Filenames are content-addressed, so a name is a cache key that never needs
// invalidating: a new artifact has a new name. Pruning is deleting whatever
// the current manifest doesn't name.
//
// Every call resolves rather than throwing: a browser in private mode, or one
// with site data blocked, refuses to open a database at all, and the catalog
// is re-fetchable.

const DATABASE = "manasphere";
const STORE = "catalog";

// The manifest is cached under its own key, so a load with no network still
// knows which pair to look for.
export const MANIFEST = "manifest.json";

function settle<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function open(): Promise<IDBDatabase | null> {
  try {
    const request = indexedDB.open(DATABASE, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(STORE);
    };
    return await settle(request);
  } catch {
    return null;
  }
}

export async function read(name: string): Promise<ArrayBuffer | null> {
  const db = await open();
  if (!db) return null;
  try {
    const store = db.transaction(STORE, "readonly").objectStore(STORE);
    return (await settle(store.get(name))) ?? null;
  } catch {
    return null;
  } finally {
    db.close();
  }
}

export async function write(name: string, bytes: ArrayBuffer): Promise<void> {
  const db = await open();
  if (!db) return;
  try {
    const store = db.transaction(STORE, "readwrite").objectStore(STORE);
    await settle(store.put(bytes, name));
  } catch {
    // A full disk or a denied quota leaves the catalog working, just uncached.
  } finally {
    db.close();
  }
}

// Throws away everything cached, so the next load starts from the network.
export async function clear(): Promise<void> {
  try {
    await settle(indexedDB.deleteDatabase(DATABASE));
  } catch {
    // Nothing cached, or nothing that can be.
  }
}

// Deletes every cached file except `keep`, which is the current pair.
export async function prune(keep: string[]): Promise<void> {
  const db = await open();
  if (!db) return;
  try {
    const store = db.transaction(STORE, "readwrite").objectStore(STORE);
    const names = await settle(store.getAllKeys());
    const wanted = new Set<IDBValidKey>([...keep, MANIFEST]);
    for (const name of names) {
      if (!wanted.has(name)) store.delete(name);
    }
  } catch {
    // Stale files cost space, not correctness.
  } finally {
    db.close();
  }
}
