import { useEffect, useState } from "react";
import { type Manifest, manifest } from "./catalog";
import { CATALOG } from "./config";

type State =
  | { status: "loading" }
  | { status: "ready"; manifest: Manifest }
  | { status: "failed"; error: string };

export function App() {
  const [state, setState] = useState<State>({ status: "loading" });

  useEffect(() => {
    let live = true;
    manifest()
      .then((found) => {
        if (live) setState({ status: "ready", manifest: found });
      })
      .catch((error: unknown) => {
        const message = error instanceof Error ? error.message : String(error);
        if (live) setState({ status: "failed", error: message });
      });
    return () => {
      live = false;
    };
  }, []);

  return (
    <main>
      <h1>Manasphere</h1>
      {state.status === "loading" && <p>Reading the catalog…</p>}
      {state.status === "ready" && <Summary manifest={state.manifest} />}
      {state.status === "failed" && (
        <p>
          No catalog at <code>{CATALOG}</code>: {state.error}
        </p>
      )}
    </main>
  );
}

function Summary({ manifest }: { manifest: Manifest }) {
  const { version, cards, prints } = manifest;
  return (
    <dl>
      <dt>Scryfall</dt>
      <dd>{version}</dd>
      <dt>Cards</dt>
      <dd>{cards.rows.toLocaleString()}</dd>
      <dt>Printings</dt>
      <dd>{prints.rows.toLocaleString()}</dd>
      <dt>Uncompressed</dt>
      <dd>{megabytes(cards.bytes + prints.bytes)}</dd>
    </dl>
  );
}

function megabytes(bytes: number) {
  return `${(bytes / 1_000_000).toFixed(1)} MB`;
}
