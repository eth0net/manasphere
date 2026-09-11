import { createContext, useContext } from "react";
import type { Holdings } from "./cards";

// A card row sits four components below where the session does.
export const Owning = createContext<Holdings | null>(null);

// Null while signed out, which is what leaves the rows with nothing to press.
export function useOwning(): Holdings | null {
  return useContext(Owning);
}
