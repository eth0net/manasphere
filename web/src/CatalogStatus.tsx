import { useEffect, useRef } from "react";
import type { Loaded } from "./catalog/load";
import { CATALOG } from "./config";
import type { Status } from "./useCatalog";

// The catalog's own state. Not a dev panel: the artifact is refreshed on
// Scryfall's cadence, so "which one am I on, and is there a newer one" is a
// question with an answer worth showing.
//
// A modal rather than a disclosure in the header, which reflowed the header
// every time it opened.
export function CatalogStatus({
  status,
  loaded,
}: {
  status: Status;
  loaded: Loaded;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const { catalog, manifest, cached } = loaded;

  // Closing on a backdrop click, natively. Set here because React's types
  // don't carry the attribute yet, and a click handler on the backdrop would
  // be a way to close that a keyboard can't reach.
  useEffect(() => {
    dialog.current?.setAttribute("closedby", "any");
  }, []);

  return (
    <>
      <button
        type="button"
        className="summary"
        onClick={() => dialog.current?.showModal()}
      >
        {catalog.cards.toLocaleString()} cards · {published(catalog.version)}
        {cached && " · cached"}
      </button>

      <dialog ref={dialog}>
        <div className="panel">
          <h2>Catalog</h2>
          <dl>
            <dt>Version</dt>
            <dd>{catalog.version}</dd>
            <dt>Cards</dt>
            <dd>{rows(manifest.cards.rows, manifest.cards.bytes)}</dd>
            <dt>Printings</dt>
            <dd>{rows(manifest.prints.rows, manifest.prints.bytes)}</dd>
            <dt>Read from</dt>
            <dd>{cached ? "this device" : CATALOG}</dd>
            <dt>Checked</dt>
            <dd>
              {status.checkedAt
                ? status.checkedAt.toLocaleTimeString()
                : "never"}
              {status.error && ` — ${status.error}`}
            </dd>
          </dl>

          <p className="actions">
            <button
              type="button"
              onClick={status.check}
              disabled={status.checking}
            >
              {status.checking ? "Checking…" : "Check for a newer catalog"}
            </button>
            <button type="button" onClick={status.reset}>
              Forget and download again
            </button>
            <button type="button" onClick={() => dialog.current?.close()}>
              Close
            </button>
          </p>
        </div>
      </dialog>
    </>
  );
}

// Shown whether or not the panel is open, because it needs an answer.
export function CatalogUpdate({ status }: { status: Status }) {
  if (!status.available) return null;
  return (
    <p className="update">
      A catalog published {published(status.available.version)} is available.{" "}
      <button type="button" onClick={status.apply}>
        Load it
      </button>
    </p>
  );
}

function rows(count: number, bytes: number) {
  return `${count.toLocaleString()} rows · ${(bytes / 1e6).toFixed(1)} MB`;
}

// The version is the bulk file's own timestamp, so its age says whether the
// weekly sync is still running.
function published(version: string) {
  const at = new Date(version);
  const days = Math.floor((Date.now() - at.getTime()) / 86_400_000);
  const day = at.toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
  });
  if (days < 1) return `${day}, today`;
  if (days === 1) return `${day}, yesterday`;
  return `${day}, ${days} days ago`;
}
