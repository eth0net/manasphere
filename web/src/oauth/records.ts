import type { OAuthSession } from "@atproto/oauth-client-browser";
import { COLLECTIONS } from "../config";

export type Repo = {
  handle: string;
  granted: string[];
  counts: { collection: string; records: number }[];
};

type Described = { handle: string; collections: string[] };
type Listed = { records: unknown[]; cursor?: string };

// The session resolves the account's own PDS, so a path is the whole address.
async function xrpc<T>(
  session: OAuthSession,
  nsid: string,
  params: Record<string, string>,
): Promise<T> {
  const query = new URLSearchParams(params);
  const response = await session.fetchHandler(`/xrpc/${nsid}?${query}`);
  if (!response.ok) {
    throw new Error(`${nsid} answered ${response.status}`);
  }
  return (await response.json()) as T;
}

// A server may drop part of a scope request, so read what came back.
export async function read(session: OAuthSession): Promise<Repo> {
  const repo = session.did;
  const [token, described] = await Promise.all([
    session.getTokenInfo(),
    xrpc<Described>(session, "com.atproto.repo.describeRepo", { repo }),
  ]);

  // describeRepo names the non-empty collections, so the rest need no call.
  const present = COLLECTIONS.filter((collection) =>
    described.collections.includes(collection),
  );

  const counts = await Promise.all(
    present.map(async (collection) => {
      const page = await xrpc<Listed>(
        session,
        "com.atproto.repo.listRecords",
        {
          repo,
          collection,
          limit: "100",
        },
      );
      return { collection, records: page.records.length };
    }),
  );

  return {
    handle: described.handle,
    granted: token.scope?.split(/\s+/).filter(Boolean) ?? [],
    counts,
  };
}
