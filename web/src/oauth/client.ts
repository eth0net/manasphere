import { BrowserOAuthClient } from "@atproto/oauth-client-browser";
import { CLIENT_ID, RESOLVER, SCOPES } from "../config";

// No OAuth server can fetch a metadata document off a laptop, so servers
// hard-code a client for `http://localhost` and read the rest out of the id.
function loopbackId(): string {
  const host =
    location.hostname === "localhost" ? "127.0.0.1" : location.hostname;
  const params = new URLSearchParams({
    redirect_uri: `http://${host}:${location.port}/`,
    scope: SCOPES.join(" "),
  });
  return `http://localhost?${params}`;
}

let loading: Promise<BrowserOAuthClient> | undefined;

export function oauth(): Promise<BrowserOAuthClient> {
  loading ??= BrowserOAuthClient.load({
    clientId: import.meta.env.DEV ? loopbackId() : CLIENT_ID,
    handleResolver: RESOLVER,
  });
  return loading;
}

type Init = Awaited<ReturnType<BrowserOAuthClient["init"]>>;

let started: Promise<Init> | undefined;

// init() takes the response out of the URL, so it runs once a page load.
export function restore(): Promise<Init> {
  started ??= oauth().then((client) => client.init());
  return started;
}
