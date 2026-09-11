import { type ReactNode, useState } from "react";
import { type Card, type Catalog, image, type Print } from "./catalog";
import { Add } from "./collection/Add";
import { Modal } from "./Modal";
import { describe, hasArt, Language } from "./Printing";

// Art is what a printing is chosen by, which a line of text cannot carry.
export function Printings({
  card,
  catalog,
  name,
  start,
  trigger,
  label,
}: {
  card: Card;
  catalog: Catalog;
  name: string;
  // Opens on one printing rather than on the grid of them.
  start?: Print;
  trigger: string;
  label: ReactNode;
}) {
  return (
    <Modal wide trigger={trigger} title={name} label={label}>
      <Gallery card={card} catalog={catalog} start={start} />
    </Modal>
  );
}

function Gallery({
  card,
  catalog,
  start,
}: {
  card: Card;
  catalog: Catalog;
  start?: Print;
}) {
  const [chosen, choose] = useState<Print | null>(start ?? null);

  // The card at reading size, which is also the whole rules text and the only
  // copy of it: the catalog carries none — see `docs/scryfall.md`.
  if (chosen) {
    return (
      <div className="detail">
        <p className="back">
          <button type="button" className="link" onClick={() => choose(null)}>
            ← All printings
          </button>
        </p>
        {hasArt(chosen) && <img src={image(chosen.id)} alt="" />}
        <p>
          {chosen.lang !== "en" && <Language code={chosen.lang} />}
          {describe(chosen)}
        </p>
        <p className="row">
          <Add print={chosen} />
        </p>
      </div>
    );
  }

  return (
    <ul className="prints">
      {catalog.prints(card.index).map((one) => (
        <li key={one.id}>
          <button type="button" className="art" onClick={() => choose(one)}>
            {hasArt(one) ? (
              <img src={image(one.id, "small")} alt="" loading="lazy" />
            ) : (
              <span className="noart" />
            )}
          </button>
          <span className="what">
            {one.lang !== "en" && <Language code={one.lang} />}
            {describe(one)}
          </span>
          <span className="row">
            <Add print={one} />
          </span>
        </li>
      ))}
    </ul>
  );
}
