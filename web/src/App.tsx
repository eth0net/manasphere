import type { Loaded } from "./catalog/load";
import { CATALOG } from "./config";
import { Search } from "./Search";
import { useCatalog } from "./useCatalog";

export function App() {
  const state = useCatalog();

  return (
    <main>
      <header>
        <h1>Manasphere</h1>
        {state.status === "ready" && <Status loaded={state.loaded} />}
      </header>

      {state.status === "loading" && <p>{state.step}…</p>}
      {state.status === "ready" && <Search catalog={state.loaded.catalog} />}
      {state.status === "failed" && (
        <p>
          No catalog at <code>{CATALOG}</code>: {state.error}
        </p>
      )}
    </main>
  );
}

function Status({ loaded }: { loaded: Loaded }) {
  const { catalog, cached } = loaded;
  return (
    <p className="status">
      {catalog.cards.toLocaleString()} cards ·{" "}
      {catalog.printings.toLocaleString()} printings ·{" "}
      {/* The version is the bulk file's own timestamp, and the day is the part
          that means anything. */}
      {catalog.version.slice(0, 10)}
      {cached && " · cached"}
    </p>
  );
}
