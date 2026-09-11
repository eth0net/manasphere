import { useMemo, useState } from "react";
import {
  appLanguage,
  type Card,
  type Catalog,
  cardName,
  image,
  type Print,
  words,
} from "../catalog";
import { Modal } from "../Modal";
import { describe, hasArt, Language } from "../Printing";
import { Printings } from "../Printings";
import { Link } from "../router";
import { CONDITIONS, type Holdings, type Stack } from "./cards";
import { type Containers, UNFILED } from "./containers";

const APP = appLanguage();

// What one place holds, a stack to a row, and where a stack is edited.
export function Place({
  catalog,
  containers,
  owning,
  place,
  name,
}: {
  catalog: Catalog | null;
  containers: Containers;
  owning: Holdings;
  // The container's at-uri, or null for what was never filed anywhere.
  place: string | null;
  name: string;
}) {
  const [filter, setFilter] = useState("");

  const filed = useMemo(
    () =>
      owning.stacks.filter((one) => (one.value.container ?? null) === place),
    [owning.stacks, place],
  );

  const found = useMemo(
    () => catalog?.resolve(filed.map((one) => one.value.scryfallId)),
    [catalog, filed],
  );

  const rows = useMemo(() => {
    const wanted = filter.trim().toLowerCase();
    return filed
      .map((one) => {
        const card = found?.get(one.value.scryfallId);
        return {
          one,
          card: card?.card,
          print: card?.print,
          // The id until the catalog loads, which is at least addressable.
          name: card
            ? cardName(card.card.name, card.print, APP).text
            : one.value.scryfallId,
        };
      })
      .filter((row) => !wanted || row.name.toLowerCase().includes(wanted))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [filed, found, filter]);

  const total = filed.reduce((sum, one) => sum + one.value.quantity, 0);

  return (
    <>
      <p className="actions">
        <Link className="link" to="/collection">
          ← Collection
        </Link>
        <span>
          {name} · {total.toLocaleString()} card{total === 1 ? "" : "s"}
        </span>
      </p>

      {filed.length > 0 && (
        <input
          className="filter"
          type="search"
          value={filter}
          placeholder={`Filter ${filed.length.toLocaleString()} stacks`}
          onChange={(event) => setFilter(event.target.value)}
        />
      )}

      {filed.length === 0 ? (
        <p className="quiet">
          Nothing here yet. Point the destination at {name} and add a card.
        </p>
      ) : (
        <ol className="results">
          {rows.map((row) => (
            <Row
              key={row.one.uri}
              one={row.one}
              card={row.card}
              print={row.print}
              name={row.name}
              catalog={catalog}
              containers={containers}
              owning={owning}
            />
          ))}
        </ol>
      )}
    </>
  );
}

function Row({
  one,
  card,
  print,
  name,
  catalog,
  containers,
  owning,
}: {
  one: Stack;
  card: Card | undefined;
  print: Print | undefined;
  name: string;
  catalog: Catalog | null;
  containers: Containers;
  owning: Holdings;
}) {
  const { quantity } = one.value;

  return (
    <li>
      <div className="card">
        {catalog && card && print && hasArt(print) && (
          <Printings
            card={card}
            catalog={catalog}
            name={name}
            start={print}
            trigger="art"
            label={
              <img src={image(print.id, "small")} alt="" loading="lazy" />
            }
          />
        )}
        <div>
          <h2>
            {name}
            {print && print.lang !== "en" && <Language code={print.lang} />}
            <span className="tag">{words(one.value.finish)}</span>
            {one.value.condition && (
              <span className="tag">{words(one.value.condition)}</span>
            )}
          </h2>
          {print && <p className="print">{describe(print)}</p>}
          <div className="meta">
            <span className="adjust">
              <button
                type="button"
                className="step"
                aria-label="One fewer"
                onClick={() =>
                  void owning.amend(one.uri, { quantity: quantity - 1 })
                }
              >
                −
              </button>
              <span className="owned">{quantity.toLocaleString()}</span>
              <button
                type="button"
                className="step"
                aria-label="One more"
                onClick={() =>
                  void owning.amend(one.uri, { quantity: quantity + 1 })
                }
              >
                +
              </button>
            </span>
            <Edit
              one={one}
              name={name}
              containers={containers}
              owning={owning}
            />
          </div>
        </div>
      </div>
    </li>
  );
}

// The two parts of a stack's identity a copy can change: where it sits, and
// how it has worn. todo(eth0net): tags, note and proxy have no editor.
function Edit({
  one,
  name,
  containers,
  owning,
}: {
  one: Stack;
  name: string;
  containers: Containers;
  owning: Holdings;
}) {
  const { amend } = owning;

  return (
    <Modal
      trigger="link"
      title={name}
      label="Edit"
      actions={
        <button
          type="button"
          onClick={() => void amend(one.uri, { quantity: 0 })}
        >
          Remove
        </button>
      }
    >
      <p className="field">
        <label htmlFor={`place-${one.uri}`}>Place</label>
        <select
          id={`place-${one.uri}`}
          value={one.value.container ?? ""}
          onChange={(event) =>
            void amend(one.uri, { container: event.target.value || undefined })
          }
        >
          <option value="">{UNFILED.name}</option>
          {containers.held.map((into) => (
            <option key={into.uri} value={into.uri}>
              {into.value.name}
            </option>
          ))}
        </select>
      </p>

      <p className="field">
        <label htmlFor={`grade-${one.uri}`}>Condition</label>
        <select
          id={`grade-${one.uri}`}
          value={one.value.condition ?? ""}
          onChange={(event) =>
            void amend(one.uri, { condition: event.target.value || undefined })
          }
        >
          <option value="">Ungraded</option>
          {CONDITIONS.map((grade) => (
            <option key={grade} value={grade}>
              {words(grade)}
            </option>
          ))}
        </select>
      </p>

      <p className="quiet">
        Moving these into a place that already holds the same grade of the same
        printing merges the two.
      </p>
    </Modal>
  );
}
