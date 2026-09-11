import { words } from "../catalog";
import type { Collection as Owned } from "./cards";
import type { Containers } from "./containers";

// What you own and where it sits. A container is a drill-down from here, never
// a tab of its own — see `docs/data-model.md`.
export function Collection({
  containers,
  owning,
}: {
  containers: Containers;
  owning: Owned;
}) {
  const unfiled = owning.copies(null);
  const empty = owning.total === 0 && containers.held.length === 0;

  return (
    <>
      <p className="tally">
        {owning.total.toLocaleString()} card{owning.total === 1 ? "" : "s"}
      </p>

      {empty ? (
        <p className="quiet">
          Nothing yet. Search for a card and press the plus beside a printing.
        </p>
      ) : (
        <ul className="breakdown">
          {unfiled > 0 && (
            <li>
              <span>Collection</span>
              <span className="quiet">unfiled</span>
              <span>{unfiled.toLocaleString()}</span>
            </li>
          )}
          {containers.held.map((one) => (
            <li key={one.uri}>
              <span>{one.value.name}</span>
              <span className="quiet">
                {one.value.kind ? words(one.value.kind) : ""}
              </span>
              <span>{owning.copies(one.uri).toLocaleString()}</span>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
