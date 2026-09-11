import { useState } from "react";
import {
  appLanguage,
  type Card,
  type Catalog,
  cardName,
  image,
  type Print,
  words,
} from "./catalog";
import type { Collection } from "./collection/cards";
import { useOwning } from "./collection/context";
import { Mana } from "./Mana";
import { describe, Language } from "./Printing";

// Nothing renders behind these, so a thumbnail would be a broken image.
const NO_IMAGE = new Set(["missing", "placeholder"]);

// Card names are read in the app's language, not the printing's. A setting of
// its own once there is somewhere to put it — see `docs/search.md`.
const APP = appLanguage();

// One card and the printing on show for it. The printing is given rather than
// chosen here, because a search picks it by language and a set is the printing.
export function CardRow({
  card,
  print,
  catalog,
}: {
  card: Card;
  print: Print | undefined;
  catalog: Catalog;
}) {
  const [open, setOpen] = useState(false);
  const owning = useOwning();
  const tags = card.kind === "card" ? card.flags : [card.kind, ...card.flags];
  const name = cardName(card.name, print, APP);

  return (
    <li>
      {print && !NO_IMAGE.has(print.imageStatus) && (
        <img src={image(print.id, "small")} alt="" loading="lazy" />
      )}
      <div>
        <h2>
          {name.text}
          {/* Only when the printing isn't in the language it is read in, so
              an English name over an English printing says nothing. */}
          {print && print.lang !== name.lang && <Language code={print.lang} />}
          {tags.map((tag) => (
            <span className="tag" key={tag}>
              {words(tag)}
            </span>
          ))}
        </h2>
        <p>
          {card.typeLine}
          {card.stats && <span className="stats">{card.stats}</span>}
          {card.manaCost && <Mana cost={card.manaCost} />}
        </p>
        {print && <p className="print">{describe(print)}</p>}
        {print && owning && <Add print={print} owning={owning} />}
        <p className="print">
          <button
            type="button"
            className="link"
            onClick={() => setOpen(!open)}
          >
            {card.printings} printing{card.printings === 1 ? "" : "s"}
          </button>
          {card.edhrecRank && ` · EDHREC #${card.edhrecRank.toLocaleString()}`}
        </p>
        {open && (
          <ul className="printings">
            {catalog.prints(card.index).map((one) => (
              <li key={one.id}>
                {one.lang !== "en" && <Language code={one.lang} />}
                {describe(one)}
                {owning && <Add print={one} owning={owning} />}
              </li>
            ))}
          </ul>
        )}
      </div>
    </li>
  );
}

// A finish is part of what a stack is, so it is chosen in the same press as
// the printing rather than asked afterward.
function Add({ print, owning }: { print: Print; owning: Collection }) {
  const have = owning.owned(print.id);

  return (
    <p className="add">
      {print.finishes.map((finish) => (
        <button
          key={finish}
          type="button"
          onClick={() => void owning.add(print.id, finish)}
        >
          + {words(finish)}
        </button>
      ))}
      {have > 0 && <span>{have} owned</span>}
    </p>
  );
}
