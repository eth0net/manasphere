import { describe, expect, test } from "bun:test";
import { type Index, normalize, search } from "./search";

describe("normalize", () => {
  test("strips diacritics", () => {
    expect(normalize("Jötun Grunt")).toBe("jotun grunt");
  });

  test("drops apostrophes without leaving a gap", () => {
    expect(normalize("Urza's Tower")).toBe("urzas tower");
    expect(normalize("Urza’s Tower")).toBe("urzas tower");
  });

  test("makes a word boundary of everything else", () => {
    expect(normalize("Fire // Ice")).toBe("fire ice");
    expect(normalize('"Ach! Hans, Run!"')).toBe("ach hans run");
    expect(normalize("Snow-Covered Forest")).toBe("snow covered forest");
  });
});

// Names have to arrive sorted, as the catalog's do, for ties to come out
// alphabetically.
function index(cards: [name: string, kind: number, printings: number][]): {
  index: Index;
  names: string[];
} {
  const sorted = [...cards].sort((a, b) => a[0].localeCompare(b[0]));
  return {
    index: {
      names: sorted.map(([name]) => normalize(name)),
      kinds: sorted.map(([, kind]) => kind),
      printings: sorted.map(([, , printings]) => printings),
    },
    names: sorted.map(([name]) => name),
  };
}

function find(
  cards: [string, number, number][],
  query: string,
  limit = 10,
): string[] {
  const built = index(cards);
  return search(built.index, query, limit).map(
    (at) => built.names[at] as string,
  );
}

describe("search", () => {
  test("an exact name leads, however obscure", () => {
    const found = find(
      [
        ["Fire", 0, 1],
        ["Fireball", 0, 40],
      ],
      "fire",
    );
    expect(found).toEqual(["Fire", "Fireball"]);
  });

  test("a word prefix ranks with a name prefix, on printings", () => {
    const found = find(
      [
        ["Bolt Bend", 0, 4],
        ["Lightning Bolt", 0, 67],
        ["Thunderbolt", 0, 90],
      ],
      "bolt",
    );
    // Lightning Bolt starts a word, Bolt Bend starts the name, and both beat
    // Thunderbolt, where "bolt" starts nothing.
    expect(found).toEqual(["Lightning Bolt", "Bolt Bend", "Thunderbolt"]);
  });

  test("a token ranks below the card it copies", () => {
    // The same name, and the token has more printings, so `kind` is the only
    // thing that can put the card first.
    const built = index([
      ["Forest", 1, 900],
      ["Forest", 0, 865],
    ]);
    const found = search(built.index, "forest", 10);
    expect(found.map((at) => built.index.kinds[at])).toEqual([0, 1]);
  });

  test("a blank query matches nothing", () => {
    const cards: [string, number, number][] = [["Forest", 0, 865]];
    expect(find(cards, "")).toEqual([]);
    expect(find(cards, "   ")).toEqual([]);
  });

  test("the limit holds across tiers", () => {
    const cards: [string, number, number][] = [
      ["Bolt Bend", 0, 4],
      ["Lightning Bolt", 0, 67],
      ["Thunderbolt", 0, 90],
    ];
    expect(find(cards, "bolt", 2)).toEqual(["Lightning Bolt", "Bolt Bend"]);
  });
});
