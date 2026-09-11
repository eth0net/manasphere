import { useState } from "react";
import { Account } from "./Account";
import { CatalogStatus, CatalogUpdate } from "./CatalogStatus";
import { useContainers } from "./collection/containers";
import { Destination } from "./collection/Destination";
import { CATALOG } from "./config";
import { Footer } from "./Footer";
import { useSession } from "./oauth/useSession";
import { Search } from "./Search";
import { useCatalog } from "./useCatalog";

export function App() {
  const status = useCatalog();
  const { load } = status;
  const account = useSession();
  const signedIn =
    account.state.status === "in" ? account.state.session : null;
  const containers = useContainers(signedIn);
  const [chosen, choose] = useState<string | null>(null);

  return (
    <main>
      <header>
        <h1>Manaweb</h1>
        {load.status === "ready" && (
          <CatalogStatus status={status} loaded={load} />
        )}
        <Account account={account} />
      </header>

      <CatalogUpdate status={status} />

      {signedIn && (
        <p className="destination">
          <Destination
            containers={containers}
            chosen={chosen}
            onChoose={choose}
          />
        </p>
      )}

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
