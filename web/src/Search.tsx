import { useMemo, useState } from "react";
import { type Card, type Catalog, image } from "./catalog";
import { Mana } from "./Mana";

// Nothing renders behind these, so a thumbnail would be a broken image.
const NO_IMAGE = new Set(["missing", "placeholder"]);

export function Search({ catalog }: { catalog: Catalog }) {
  const [query, setQuery] = useState("");

  // A scan of every name costs about a millisecond, so it runs per keystroke
  // rather than behind a debounce.
  const found = useMemo(() => catalog.search(query), [catalog, query]);

  return (
    <>
      <input
        type="search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Search cards"
      />
      {query && found.length === 0 && <p>Nothing matches “{query}”.</p>}
      <ol className="results">
        {found.map((card) => (
          <Result key={card.oracleId} card={card} catalog={catalog} />
        ))}
      </ol>
    </>
  );
}

function Result({ card, catalog }: { card: Card; catalog: Catalog }) {
  // The first of the run is the printing to show, which is what the artifact's
  // ordering decides.
  const print = catalog.prints(card.index)[0];

  return (
    <li>
      {print && !NO_IMAGE.has(print.imageStatus) && (
        <img src={image(print.id, "small")} alt="" loading="lazy" />
      )}
      <div>
        <h2>
          {card.name}
          {card.kind !== "card" && <span className="tag">{card.kind}</span>}
        </h2>
        <p>
          {card.typeLine}
          {card.manaCost && <Mana cost={card.manaCost} />}
        </p>
        {print && (
          <p className="print">
            {print.setName} · {print.set.toUpperCase()} #
            {print.collectorNumber} · {print.rarity}
            {card.printings > 1 && ` · ${card.printings} printings`}
            {card.edhrecRank &&
              ` · EDHREC #${card.edhrecRank.toLocaleString()}`}
          </p>
        )}
      </div>
    </li>
  );
}
