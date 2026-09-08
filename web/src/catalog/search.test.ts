import { describe, expect, test } from "bun:test";
import { readable } from ".";
import { type Index, normalize, scores, search } from "./search";

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

type Row = [
  name: string,
  kind: number,
  printings: number,
  edhrecRank?: number | null,
];

// Names have to arrive sorted, as the catalog's do, for ties to come out
// alphabetically.
function index(cards: Row[]): { index: Index; names: string[] } {
  const sorted = [...cards].sort((a, b) => a[0].localeCompare(b[0]));
  return {
    index: {
      names: sorted.map(([name]) => normalize(name)),
      kinds: sorted.map(([, kind]) => kind),
      scores: scores(
        sorted.map(([, , , rank]) => rank ?? null),
        sorted.map(([, , printings]) => printings),
      ),
    },
    names: sorted.map(([name]) => name),
  };
}

function find(cards: Row[], query: string, limit = 10): string[] {
  const built = index(cards);
  return search(built.index, query, limit).map(
    (at) => built.names[at] as string,
  );
}

describe("search", () => {
  test("an exact name leads, however obscure", () => {
    const found = find(
      [
        ["Fire", 0, 1, 9000],
        ["Fireball", 0, 40, 300],
      ],
      "fire",
    );
    expect(found).toEqual(["Fire", "Fireball"]);
  });

  test("a word prefix ranks with a name prefix, on standing", () => {
    const found = find(
      [
        ["Bolt Bend", 0, 4, 537],
        ["Lightning Bolt", 0, 67, 158],
        ["Thunderbolt", 0, 90, 1],
      ],
      "bolt",
    );
    // Lightning Bolt starts a word, Bolt Bend starts the name, and both beat
    // Thunderbolt however well ranked, because "bolt" starts nothing there.
    expect(found).toEqual(["Lightning Bolt", "Bolt Bend", "Thunderbolt"]);
  });

  test("a rank beats reprints", () => {
    const found = find(
      [
        ["Aladdin's Ring", 0, 6, 24725],
        ["The One Ring", 0, 3, 91],
      ],
      "ring",
    );
    expect(found).toEqual(["The One Ring", "Aladdin's Ring"]);
  });

  test("reprints stand in for a rank nothing has", () => {
    // A basic land carries no EDHREC rank, and has to lead anyway.
    const found = find(
      [
        ["Forest", 0, 865, null],
        ["Karplusan Forest", 0, 29, 222],
      ],
      "fores",
    );
    expect(found).toEqual(["Forest", "Karplusan Forest"]);
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
    const cards: Row[] = [["Forest", 0, 865]];
    expect(find(cards, "")).toEqual([]);
    expect(find(cards, "   ")).toEqual([]);
  });

  test("the limit holds across tiers", () => {
    const cards: Row[] = [
      ["Bolt Bend", 0, 4, 537],
      ["Lightning Bolt", 0, 67, 158],
      ["Thunderbolt", 0, 90, 1],
    ];
    expect(find(cards, "bolt", 2)).toEqual(["Lightning Bolt", "Bolt Bend"]);
  });
});

describe("readable", () => {
  test("keeps a name a font can show", () => {
    expect(readable("対抗呪文")).toBe("対抗呪文");
    expect(readable("Crecimiento gigante")).toBe("Crecimiento gigante");
  });

  test("drops one printed in the Private Use Area", () => {
    // Nine Tengwar codepoints, which is how Quenya printings carry a name.
    expect(readable("\u{E025}\u{E04A}\u{E022} \u{E020}\u{E04A}")).toBe(null);
    expect(readable(null)).toBe(null);
  });
});
