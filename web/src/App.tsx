import { useState } from "react";
import { Account } from "./Account";
import { CatalogStatus, CatalogUpdate } from "./CatalogStatus";
import { useCollection } from "./collection/cards";
import { useContainers } from "./collection/containers";
import { Owning } from "./collection/context";
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
  const collection = useCollection(signedIn, chosen);

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
          {collection.error && (
            <span className="warn">{collection.error}</span>
          )}
        </p>
      )}

      {/* Signed out leaves this null, which is what hides every add button. */}
      <Owning value={collection.ready ? collection : null}>
        {load.status === "loading" && <p>{load.step}…</p>}
        {load.status === "ready" && <Search catalog={load.catalog} />}
        {load.status === "failed" && (
          <p>
            No catalog at <code>{CATALOG}</code>: {load.error}
          </p>
        )}
      </Owning>

      <Footer />
    </main>
  );
}
