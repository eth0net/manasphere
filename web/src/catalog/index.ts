import { type Index, normalize, scores, search } from "./search";

// One file of the pair. `name` resolves against the manifest's own URL, so the
// catalog can move origin without the format changing.
export interface Entry {
  name: string;
  rows: number;
  bytes: number;
}

// What a client fetches first, and the only part it re-fetches: the artifact
// files are content-addressed and immutable.
export interface Manifest {
  version: string;
  cards: Entry;
  prints: Entry;
}

// Positional rows, in the order each file's own `fields` names. Kept raw:
// 145,000 rows as objects would cost far more than the strings they hold, and
// only what's on screen is ever materialized.
type CardRow = [
  oracleId: string,
  name: string,
  typeLine: string | null,
  manaCost: string | null,
  cmc: number | null,
  colors: string | null,
  colorIdentity: string,
  kind: number,
  printings: number,
  edhrecRank: number | null,
];

type PrintRow = [
  id: string,
  set: number,
  collectorNumber: string,
  finishes: number,
  rarity: number,
  layout: number,
  imageStatus: number,
  lang: number,
  printedName: string | null,
];

interface CardFile {
  version: string;
  kinds: string[];
  cards: CardRow[];
}

// Every integer column on a print row indexes one of these tables, ordered
// commonest first so the value that repeats most is the shortest to write.
interface PrintFile {
  version: string;
  finishes: string[];
  rarities: string[];
  layouts: string[];
  imageStatuses: string[];
  langs: string[];
  sets: [code: string, name: string, kind: string, released: string][];
  prints: PrintRow[];
}

export interface Card {
  index: number;
  oracleId: string;
  name: string;
  typeLine: string | null;
  manaCost: string | null;
  cmc: number | null;
  colors: string | null;
  colorIdentity: string;
  kind: string;
  printings: number;
  // EDHREC's Commander popularity, lower being more played. Absent for every
  // token and art series, and for the basic lands.
  edhrecRank: number | null;
}

export interface Print {
  id: string;
  set: string;
  setName: string;
  collectorNumber: string;
  finishes: string[];
  rarity: string;
  layout: string;
  imageStatus: string;
  lang: string;
  printedName: string | null;
}

// Scryfall's image CDN, hotlinked: the path derives from the id, so no URL is
// stored. Nothing is behind it for a print whose `imageStatus` is `missing` or
// `placeholder`.
export function image(id: string, size = "normal"): string {
  return `https://cards.scryfall.io/${size}/front/${id[0]}/${id[1]}/${id}.jpg`;
}

export class Catalog {
  readonly version: string;
  #cards: CardFile;
  #prints: PrintFile;
  // Where each card's run of printings starts, with the total on the end, so
  // a card's printings are `prints[offsets[i]]` up to `offsets[i + 1]`.
  #offsets: Int32Array;
  #index: Index;

  constructor(cards: CardFile, prints: PrintFile) {
    if (cards.version !== prints.version) {
      throw new Error(
        `catalog halves disagree: ${cards.version} and ${prints.version}`,
      );
    }

    this.version = cards.version;
    this.#cards = cards;
    this.#prints = prints;

    this.#offsets = new Int32Array(cards.cards.length + 1);
    let offset = 0;
    for (let i = 0; i < cards.cards.length; i++) {
      this.#offsets[i] = offset;
      offset += (cards.cards[i] as CardRow)[8];
    }
    this.#offsets[cards.cards.length] = offset;

    // The runs are how a card finds its printings, so a total that disagrees
    // would shift every card past the first bad one.
    if (offset !== prints.prints.length) {
      throw new Error(
        `catalog claims ${offset} printings and holds ${prints.prints.length}`,
      );
    }

    this.#index = {
      names: cards.cards.map((row) => normalize(row[1])),
      kinds: cards.cards.map((row) => row[7]),
      scores: scores(
        cards.cards.map((row) => row[9]),
        cards.cards.map((row) => row[8]),
      ),
    };
  }

  get cards(): number {
    return this.#cards.cards.length;
  }

  get printings(): number {
    return this.#prints.prints.length;
  }

  search(query: string, limit = 50): Card[] {
    return search(this.#index, query, limit).map((index) => this.card(index));
  }

  card(index: number): Card {
    const row = this.#cards.cards[index];
    if (!row) throw new RangeError(`no card ${index}`);
    return {
      index,
      oracleId: row[0],
      name: row[1],
      typeLine: row[2],
      manaCost: row[3],
      cmc: row[4],
      colors: row[5],
      colorIdentity: row[6],
      kind: this.#cards.kinds[row[7]] as string,
      printings: row[8],
      edhrecRank: row[9],
    };
  }

  // Every paper printing of a card, in the order search shows them: the
  // first is the one to display.
  prints(index: number): Print[] {
    const start = this.#offsets[index];
    const end = this.#offsets[index + 1];
    if (start === undefined || end === undefined) {
      throw new RangeError(`no card ${index}`);
    }

    const prints: Print[] = [];
    for (let i = start; i < end; i++) {
      prints.push(this.#print(this.#prints.prints[i] as PrintRow));
    }
    return prints;
  }

  #print(row: PrintRow): Print {
    const set = this.#prints.sets[row[1]] as PrintFile["sets"][number];
    return {
      id: row[0],
      set: set[0],
      setName: set[1],
      collectorNumber: row[2],
      finishes: this.#prints.finishes.filter((_, bit) => row[3] & (1 << bit)),
      rarity: this.#prints.rarities[row[4]] as string,
      layout: this.#prints.layouts[row[5]] as string,
      imageStatus: this.#prints.imageStatuses[row[6]] as string,
      lang: this.#prints.langs[row[7]] as string,
      printedName: row[8],
    };
  }
}
