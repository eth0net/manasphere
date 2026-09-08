import { CatalogStatus, CatalogUpdate } from "./CatalogStatus";
import { CATALOG } from "./config";
import { Search } from "./Search";
import { useCatalog } from "./useCatalog";

export function App() {
  const status = useCatalog();
  const { load } = status;

  return (
    <main>
      <header>
        <h1>Manasphere</h1>
        {load.status === "ready" && (
          <CatalogStatus status={status} loaded={load} />
        )}
      </header>

      <CatalogUpdate status={status} />

      {load.status === "loading" && <p>{load.step}…</p>}
      {load.status === "ready" && <Search catalog={load.catalog} />}
      {load.status === "failed" && (
        <p>
          No catalog at <code>{CATALOG}</code>: {load.error}
        </p>
      )}
    </main>
  );
}
