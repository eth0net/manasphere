import { Account } from "./Account";
import { CatalogStatus, CatalogUpdate } from "./CatalogStatus";
import { CATALOG } from "./config";
import { Footer } from "./Footer";
import { Search } from "./Search";
import { useCatalog } from "./useCatalog";

export function App() {
  const status = useCatalog();
  const { load } = status;

  return (
    <main>
      <header>
        <h1>Manaweb</h1>
        {load.status === "ready" && (
          <CatalogStatus status={status} loaded={load} />
        )}
        <Account />
      </header>

      <CatalogUpdate status={status} />

      {load.status === "loading" && <p>{load.step}…</p>}
      {load.status === "ready" && <Search catalog={load.catalog} />}
      {load.status === "failed" && (
        <p>
          No catalog at <code>{CATALOG}</code>: {load.error}
        </p>
      )}

      <Footer />
    </main>
  );
}
