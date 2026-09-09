// The catalog cached as the bytes that came off the wire, keyed by the
// content-addressed filename, so no name ever needs invalidating.
//
// Every call resolves rather than throwing: a browser with site data blocked
// opens no database at all, and the catalog is re-fetchable.

const DATABASE = "manaweb";
const STORE = "catalog";

// Cached too, so a load with no network knows which pair to look for.
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

export async function clear(): Promise<void> {
  try {
    await settle(indexedDB.deleteDatabase(DATABASE));
  } catch {
    // Nothing cached, or nothing that can be.
  }
}

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
