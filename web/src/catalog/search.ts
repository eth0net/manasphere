// Name search over the whole catalog, in the browser.
//
// 37,000 names is small enough that a scan per keystroke costs a few
// milliseconds, so there is no index to build or keep in step. Names are
// normalized once at load.

// What a scan reads, held as parallel arrays because that is how the catalog
// arrives.
export interface Index {
  names: string[];
  kinds: number[];
  printings: number[];
}

// Lowercased, diacritics stripped so "jotun" finds "Jötun Grunt", apostrophes
// dropped so "urzas" finds "Urza's Tower", and everything else that isn't a
// letter or a digit collapsed to a single space — which is what makes `//` on
// a split card a word boundary.
export function normalize(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

// Exact, then starting a word, then anywhere. A whole-name prefix is not a
// tier of its own: "bolt" has to lead with Lightning Bolt rather than filling
// on Bolt Bend and Bolt Hound.
const TIERS = 3;

// Tokens and art series rank below cards, which is the order `kind` already
// carries, so "forest" leads with the land and not its token.
const KINDS = 3;

export function search(index: Index, query: string, limit: number): number[] {
  const wanted = normalize(query);
  if (!wanted) return [];

  const { names, kinds, printings } = index;
  const buckets: number[][] = Array.from({ length: TIERS * KINDS }, () => []);

  for (let card = 0; card < names.length; card++) {
    const tier = rank(names[card] as string, wanted);
    if (tier !== null) {
      (buckets[tier * KINDS + (kinds[card] as number)] as number[]).push(card);
    }
  }

  const found: number[] = [];
  for (const bucket of buckets) {
    if (found.length >= limit) break;
    // Printings stand in for how well known a card is — Lightning Bolt has 67
    // and Bolt Bend has 4 — which is the only popularity signal the artifact
    // carries. Rows arrive sorted by name, and the sort is stable, so a tie
    // stays alphabetical.
    bucket.sort((a, b) => (printings[b] as number) - (printings[a] as number));
    found.push(...bucket.slice(0, limit - found.length));
  }
  return found;
}

function rank(name: string, wanted: string): number | null {
  if (name === wanted) return 0;
  if (name.startsWith(wanted) || name.includes(` ${wanted}`)) return 1;
  if (name.includes(wanted)) return 2;
  return null;
}
