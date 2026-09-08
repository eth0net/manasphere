import { useEffect, useState } from "react";
import { type Loaded, load } from "./catalog/load";

export type State =
  | { status: "loading"; step: string }
  | { status: "ready"; loaded: Loaded }
  | { status: "failed"; error: string };

// The catalog is a singleton and the load is megabytes, so it happens once per
// page however many components ask for it — including twice under StrictMode.
let pending: Promise<Loaded> | null = null;
let step = "Starting";

export function useCatalog(): State {
  const [state, setState] = useState<State>({ status: "loading", step });

  useEffect(() => {
    let live = true;
    pending ??= load((of) => {
      step = of;
      if (live) setState({ status: "loading", step: of });
    });

    pending
      .then((loaded) => {
        if (live) setState({ status: "ready", loaded });
      })
      .catch((error: unknown) => {
        // A failed load is not cached: the next visit tries again.
        pending = null;
        if (live) setState({ status: "failed", error: message(error) });
      });

    return () => {
      live = false;
    };
  }, []);

  return state;
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
