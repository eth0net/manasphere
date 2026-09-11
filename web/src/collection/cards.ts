import type { OAuthSession } from "@atproto/oauth-client-browser";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { Main } from "../lexicons/app/manaweb/card";
import {
  create,
  type Fields,
  type Held,
  list,
  put,
  rkey,
} from "../oauth/repo";

export const CARD = "app.manaweb.card";

// Copies you own, however many of them are identical.
export type Owned = Fields<Main>;

export type Collection = {
  ready: boolean;
  error?: string;
  // Copies of one printing, wherever they sit and whatever grade they carry.
  owned: (scryfallId: string) => number;
  // Copies filed in one place, or unfiled where that is null.
  copies: (container: string | null) => number;
  total: number;
  add: (scryfallId: string, finish: string) => Promise<void>;
};

// Two stacks of one printing differ by grade and by where they sit, so all
// four fields identify a stack, and an add matching all four is an increment.
export function stack(one: Owned): string {
  return JSON.stringify([
    one.scryfallId,
    one.finish,
    one.condition ?? null,
    one.container ?? null,
  ]);
}

export function useCollection(
  session: OAuthSession | null,
  destination: string | null,
): Collection {
  const [held, setHeld] = useState<Held<Owned>[]>([]);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string>();

  useEffect(() => {
    if (!session) {
      setHeld([]);
      setReady(false);
      return;
    }
    let live = true;
    list<Owned>(session, CARD).then(
      (found) => {
        if (!live) return;
        setHeld(found);
        setReady(true);
      },
      (failure: unknown) => live && setError(reason(failure)),
    );
    return () => {
      live = false;
    };
  }, [session]);

  const totals = useMemo(() => {
    const prints = new Map<string, number>();
    const places = new Map<string | null, number>();
    let total = 0;
    for (const { value } of held) {
      const print = value.scryfallId;
      const place = value.container ?? null;
      prints.set(print, (prints.get(print) ?? 0) + value.quantity);
      places.set(place, (places.get(place) ?? 0) + value.quantity);
      total += value.quantity;
    }
    return { prints, places, total };
  }, [held]);

  const owned = useCallback(
    (scryfallId: string) => totals.prints.get(scryfallId) ?? 0,
    [totals],
  );

  const copies = useCallback(
    (container: string | null) => totals.places.get(container) ?? 0,
    [totals],
  );

  const add = useCallback(
    async (scryfallId: string, finish: string) => {
      if (!session) return;
      const now = new Date().toISOString();
      const wanted: Owned = {
        scryfallId,
        finish,
        quantity: 1,
        createdAt: now,
        ...(destination ? { container: destination } : {}),
      };
      const already = held.find((one) => stack(one.value) === stack(wanted));

      try {
        if (already) {
          const value: Owned = {
            ...already.value,
            quantity: already.value.quantity + 1,
            updatedAt: now,
          };
          const written = await put(session, CARD, rkey(already.uri), value);
          setHeld((was) =>
            was.map((one) =>
              one.uri === already.uri ? { ...written, value } : one,
            ),
          );
        } else {
          const written = await create(session, CARD, wanted);
          setHeld((was) => [...was, { ...written, value: wanted }]);
        }
      } catch (failure) {
        setError(reason(failure));
      }
    },
    [session, destination, held],
  );

  return { ready, error, owned, copies, total: totals.total, add };
}

function reason(failure: unknown): string {
  return failure instanceof Error ? failure.message : String(failure);
}
