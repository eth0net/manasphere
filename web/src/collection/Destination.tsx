import { useState } from "react";
import { words } from "../catalog";
import { Modal } from "../Modal";
import { type Containers, KINDS } from "./containers";

// Nothing picked leaves `container` off the record, which the lexicon reads as
// unfiled, so this name is a label and never a record.
const UNFILED = "Collection";

// Where adds land, named wherever cards are being added from.
export function Destination({
  containers,
  chosen,
  onChoose,
}: {
  containers: Containers;
  chosen: string | null;
  onChoose: (uri: string | null) => void;
}) {
  const { held, error, add, drop } = containers;
  const here = held.find((one) => one.uri === chosen);

  return (
    <Modal
      trigger="summary"
      title="Where cards go"
      label={`→ ${here?.value.name ?? UNFILED}`}
    >
      <ul className="places">
        <li>
          <button
            type="button"
            className="link"
            aria-current={chosen === null}
            onClick={() => onChoose(null)}
          >
            {UNFILED}
          </button>
          <span>everything not filed anywhere</span>
        </li>
        {held.map((one) => (
          <li key={one.uri}>
            <button
              type="button"
              className="link"
              aria-current={one.uri === chosen}
              onClick={() => onChoose(one.uri)}
            >
              {one.value.name}
            </button>
            {one.value.kind && <span>{words(one.value.kind)}</span>}
            <button
              type="button"
              onClick={() => {
                if (one.uri === chosen) onChoose(null);
                void drop(one.uri);
              }}
            >
              Remove
            </button>
          </li>
        ))}
      </ul>

      <New add={add} />
      {error && <p className="warn">{error}</p>}
    </Modal>
  );
}

function New({ add }: { add: Containers["add"] }) {
  const [name, setName] = useState("");
  const [kind, setKind] = useState(KINDS[0] as string);

  return (
    <form
      className="query"
      onSubmit={(event) => {
        event.preventDefault();
        void add(name, kind);
        setName("");
      }}
    >
      <input
        type="search"
        value={name}
        placeholder="New binder or box"
        onChange={(event) => setName(event.target.value)}
      />
      <select value={kind} onChange={(event) => setKind(event.target.value)}>
        {KINDS.map((one) => (
          <option key={one} value={one}>
            {words(one)}
          </option>
        ))}
      </select>
      <button type="submit" disabled={name.trim().length === 0}>
        Add
      </button>
    </form>
  );
}
