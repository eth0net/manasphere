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
  // Lower is better, from `scores` below.
  scores: Float64Array;
}

// One popularity number per card, lower being better, from the two signals the
// artifact carries.
//
// EDHREC's rank is the real one, and 15% of cards have none: every token and
// art series, and — the case that matters — the basic lands. So an unranked
// card gets a rank estimated from how often it was reprinted, which is what
// keeps Forest (865 printings, no rank) above Karplusan Forest (#222). Ranking
// the unranked last instead puts Karplusan first, and ignoring the rank
// entirely puts Aladdin's Ring (#24,725) above The One Ring (#91).
export function scores(
  ranks: (number | null)[],
  printings: number[],
): Float64Array {
  let worst = 0;
  for (const rank of ranks) {
    if (rank !== null && rank > worst) worst = rank;
  }

  const scores = new Float64Array(ranks.length);
  for (let card = 0; card < ranks.length; card++) {
    scores[card] = ranks[card] ?? worst / (printings[card] as number);
  }
  return scores;
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

  const { names, kinds, scores } = index;
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
    // Rows arrive sorted by name, and the sort is stable, so cards of equal
    // standing stay alphabetical.
    bucket.sort((a, b) => (scores[a] as number) - (scores[b] as number));
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
