import { createContext, useContext } from "react";
import type { Collection } from "./cards";

// A card row sits four components below where the session does, and every one
// in between is about the catalog rather than about owning any of it.
export const Owning = createContext<Collection | null>(null);

// Null while signed out, which is what leaves the rows with nothing to press.
export function useOwning(): Collection | null {
  return useContext(Owning);
}
