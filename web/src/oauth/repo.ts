import type { OAuthSession } from "@atproto/oauth-client-browser";

// A record as it is written: `$type` is added below, and a plain Omit would
// drop every named field past the open index signature a lexicon carries.
export type Fields<T> = {
  [K in keyof T as K extends "$type" ? never : K]: T[K];
};

// A record as the repo holds it: the value, plus what addresses and versions it.
export type Held<T> = { uri: string; cid: string; value: T };

type Page<T> = { records: Held<T>[]; cursor?: string };
type Written = { uri: string; cid: string };

// The session resolves the account's own PDS, so a path is the whole address.
async function query<T>(
  session: OAuthSession,
  nsid: string,
  params: Record<string, string>,
): Promise<T> {
  const search = new URLSearchParams(params);
  return unwrap(await session.fetchHandler(`/xrpc/${nsid}?${search}`), nsid);
}

async function procedure<T>(
  session: OAuthSession,
  nsid: string,
  body: unknown,
): Promise<T> {
  const response = await session.fetchHandler(`/xrpc/${nsid}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return unwrap(response, nsid);
}

// A status alone says nothing useful: the reason is in the body's `message`.
async function unwrap<T>(response: Response, nsid: string): Promise<T> {
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const said = (body as { message?: string } | null)?.message;
    throw new Error(`${nsid}: ${said ?? response.status}`);
  }
  return body as T;
}

// Every record in one collection, paged out in full.
export async function list<T>(
  session: OAuthSession,
  collection: string,
): Promise<Held<T>[]> {
  const held: Held<T>[] = [];
  let cursor: string | undefined;

  for (;;) {
    const page = await query<Page<T>>(
      session,
      "com.atproto.repo.listRecords",
      {
        repo: session.did,
        collection,
        limit: "100",
        ...(cursor ? { cursor } : {}),
      },
    );
    held.push(...page.records);
    if (!page.cursor || page.records.length === 0) return held;
    cursor = page.cursor;
  }
}

// The server picks the key, which is a TID and therefore creation order.
export function create<T extends object>(
  session: OAuthSession,
  collection: string,
  record: T,
): Promise<Written> {
  return procedure(session, "com.atproto.repo.createRecord", {
    repo: session.did,
    collection,
    record: { $type: collection, ...record },
  });
}

export function put<T extends object>(
  session: OAuthSession,
  collection: string,
  key: string,
  record: T,
): Promise<Written> {
  return procedure(session, "com.atproto.repo.putRecord", {
    repo: session.did,
    collection,
    rkey: key,
    record: { $type: collection, ...record },
  });
}

export function remove(
  session: OAuthSession,
  collection: string,
  key: string,
): Promise<unknown> {
  return procedure(session, "com.atproto.repo.deleteRecord", {
    repo: session.did,
    collection,
    rkey: key,
  });
}

// `at://did/collection/key`, of which only the last part addresses a write.
export function rkey(uri: string): string {
  return uri.slice(uri.lastIndexOf("/") + 1);
}

export { query };
