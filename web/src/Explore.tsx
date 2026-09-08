import { useMemo, useState } from "react";
import { CardRow } from "./CardRow";
import type { Catalog } from "./catalog";

// What an empty search box shows. Browsing 988 sets answers "what did this set
// hold" without a query, which paging 37,564 cards blindly would not.
export function Explore({ catalog }: { catalog: Catalog }) {
  const [code, setCode] = useState("");

  return code ? (
    <Printings catalog={catalog} code={code} onBack={() => setCode("")} />
  ) : (
    <Sets catalog={catalog} onSet={setCode} />
  );
}

function Sets({
  catalog,
  onSet,
}: {
  catalog: Catalog;
  onSet: (code: string) => void;
}) {
  const [filter, setFilter] = useState("");

  const sets = useMemo(() => {
    const wanted = filter.trim().toLowerCase();
    return (
      catalog
        .sets()
        .filter(({ set, printings }) => {
          if (printings === 0) return false;
          if (!wanted) return true;
          return (
            set[1].toLowerCase().includes(wanted) || set[0].includes(wanted)
          );
        })
        // Newest first, which puts an announced set at the top during spoilers.
        .sort((a, b) => b.set[3].localeCompare(a.set[3]))
    );
  }, [catalog, filter]);

  return (
    <>
      <input
        type="search"
        value={filter}
        placeholder={`Filter ${sets.length.toLocaleString()} sets`}
        onChange={(event) => setFilter(event.target.value)}
      />
      <ul className="sets">
        {sets.map(({ set, printings }) => (
          <li key={set[0]}>
            <button
              type="button"
              className="link"
              onClick={() => onSet(set[0])}
            >
              {set[1]}
            </button>
            <span>
              {set[0].toUpperCase()} · {set[3].slice(0, 4)} ·{" "}
              {printings.toLocaleString()} printings
            </span>
          </li>
        ))}
      </ul>
    </>
  );
}

function Printings({
  catalog,
  code,
  onBack,
}: {
  catalog: Catalog;
  code: string;
  onBack: () => void;
}) {
  const printings = useMemo(() => catalog.setPrints(code), [catalog, code]);
  const name = printings[0]?.print.setName ?? code.toUpperCase();

  return (
    <>
      <p className="actions">
        <button type="button" onClick={onBack}>
          All sets
        </button>
        <span>
          {name} · {printings.length.toLocaleString()} printings
        </span>
      </p>
      <ol className="results">
        {printings.map(({ card, print }) => (
          <CardRow
            key={print.id}
            card={catalog.card(card)}
            catalog={catalog}
            print={print}
          />
        ))}
      </ol>
    </>
  );
}
