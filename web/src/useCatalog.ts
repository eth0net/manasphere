import { useCallback, useEffect, useRef, useState } from "react";
import type { Manifest } from "./catalog";
import { type Loaded, latest, load, same } from "./catalog/load";
import { clear } from "./catalog/store";

// Scryfall publishes gameplay data about weekly and our sync follows, so a
// check is cheap and rare. A tab left open across a publish is the only reason
// this exists: a page load reads the manifest anyway.
const EVERY = 6 * 60 * 60 * 1000;

// A tab coming back from the background checks if it has been this long, which
// is the case a timer alone misses — a sleeping machine doesn't fire timers.
const STALE = 60 * 60 * 1000;

export type Load =
  | { status: "loading"; step: string }
  | ({ status: "ready" } & Loaded)
  | { status: "failed"; error: string };

export interface Status {
  load: Load;
  // A newer catalog than the one loaded, if the last check found one.
  available: Manifest | null;
  checkedAt: Date | null;
  checking: boolean;
  // A failed check, which leaves the loaded catalog alone.
  error: string | null;
  check: () => void;
  // Loads the catalog the last check found.
  apply: () => void;
  // Throws the cache away and loads again from the network.
  reset: () => void;
}

// The catalog is a singleton and the load is megabytes, so it happens once per
// page however many components ask for it — including twice under StrictMode.
let pending: Promise<Loaded> | null = null;
let step = "Starting";

export function useCatalog(): Status {
  const [state, setState] = useState<Load>({ status: "loading", step });
  const [available, setAvailable] = useState<Manifest | null>(null);
  const [checkedAt, setCheckedAt] = useState<Date | null>(null);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  // What a check compares against, in a ref so checking doesn't have to be
  // rebuilt every time the catalog changes.
  const loaded = useRef<Manifest | null>(null);

  const start = useCallback(() => {
    pending ??= load((of) => {
      step = of;
      if (alive.current) setState({ status: "loading", step: of });
    });

    const mine = pending;
    mine
      .then((done) => {
        loaded.current = done.manifest;
        if (!alive.current) return;
        setState({ status: "ready", ...done });
        setAvailable(null);
        setError(null);
        setCheckedAt(new Date());
      })
      .catch((raised: unknown) => {
        // A failed load is not kept: the next attempt starts over.
        if (pending === mine) pending = null;
        if (alive.current) setState({ status: "failed", error: said(raised) });
      });
  }, []);

  useEffect(start, [start]);

  const check = useCallback(async () => {
    setChecking(true);
    try {
      const found = await latest();
      const current = loaded.current;
      if (!alive.current) return;
      setAvailable(current && !same(current, found) ? found : null);
      setError(null);
    } catch (raised: unknown) {
      if (alive.current) setError(said(raised));
    } finally {
      if (alive.current) {
        // A failed check is still a check, or the timer below retries at once.
        setCheckedAt(new Date());
        setChecking(false);
      }
    }
  }, []);

  const apply = useCallback(() => {
    pending = null;
    setAvailable(null);
    setState({ status: "loading", step: "Loading the new catalog" });
    start();
  }, [start]);

  const reset = useCallback(async () => {
    await clear();
    apply();
  }, [apply]);

  // Rescheduled by `checkedAt` changing, so the wait is always measured from
  // the last check rather than from mount.
  useEffect(() => {
    if (state.status !== "ready") return;

    const since = checkedAt ? Date.now() - checkedAt.getTime() : EVERY;
    const timer = setTimeout(() => void check(), Math.max(0, EVERY - since));

    const woken = () => {
      if (document.visibilityState !== "visible") return;
      if (!checkedAt || Date.now() - checkedAt.getTime() > STALE) void check();
    };
    document.addEventListener("visibilitychange", woken);

    return () => {
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", woken);
    };
  }, [state.status, checkedAt, check]);

  return {
    load: state,
    available,
    checkedAt,
    checking,
    error,
    check: () => void check(),
    apply,
    reset: () => void reset(),
  };
}

function said(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
