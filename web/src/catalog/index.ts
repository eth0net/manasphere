import { type Index, normalize, scores, search } from "./search";

// `name` resolves against the manifest's own URL, so the catalog can move.
export interface Entry {
  name: string;
  rows: number;
  bytes: number;
}

// Fetched first, and the only part re-fetched: the files are immutable.
export interface Manifest {
  version: string;
  cards: Entry;
  prints: Entry;
}

// Positional rows, in the order each file's own `fields` names them. Kept
// raw: only what reaches the screen is materialized.
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
  stats: string | null,
  flags: number,
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
  artist: number | null,
  flags: number,
];

interface CardFile {
  version: string;
  fields: string[];
  kinds: string[];
  flags: string[];
  cards: CardRow[];
}

// Every integer column on a print row indexes one of these, commonest first.
interface PrintFile {
  version: string;
  fields: string[];
  finishes: string[];
  flags: string[];
  rarities: string[];
  layouts: string[];
  imageStatuses: string[];
  langs: string[];
  artists: string[];
  sets: [code: string, name: string, kind: string, released: string][];
  prints: PrintRow[];
}

// The columns this client reads, in the order it reads them. Rows are
// positional, so a column read at the wrong index is plausible data rather
// than an error — and every file names its own, so hold it to them.
const CARD_FIELDS = [
  "oracleId",
  "name",
  "typeLine",
  "manaCost",
  "cmc",
  "colors",
  "colorIdentity",
  "kind",
  "printings",
  "edhrecRank",
  "stats",
  "flags",
];

const PRINT_FIELDS = [
  "id",
  "set",
  "collectorNumber",
  "finishes",
  "rarity",
  "layout",
  "imageStatus",
  "lang",
  "printedName",
  "artist",
  "flags",
];

export interface Card {
  index: number;
  oracleId: string;
  name: string;
  typeLine: string | null;
  // Empty and absent differ: a land's cost is empty and a colorless card's
  // colors are, where a reversible card has neither, they being on its faces.
  manaCost: string | null;
  cmc: number | null;
  colors: string | null;
  colorIdentity: string;
  kind: string;
  printings: number;
  // Lower is more played. Absent for tokens, art series and basic lands.
  edhrecRank: number | null;
  // `3/3`, or a loyalty or defense alone. The type line says which.
  stats: string | null;
  // Named by the file, so a flag the artifact gains needs nothing here.
  flags: string[];
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
  artist: string | null;
  // What makes this copy not the plain one.
  flags: string[];
}

// Hotlinked from the id, so no URL is stored. Nothing is behind it when
// `imageStatus` is `missing` or `placeholder`.
export function image(id: string, size = "normal"): string {
  return `https://cards.scryfall.io/${size}/front/${id[0]}/${id[1]}/${id}.jpg`;
}

// Tengwar sits in the Private Use Area, so no font on the device has it.
const PRIVATE_USE = /[\u{E000}-\u{F8FF}]/u;

export function readable(name: string | null): string | null {
  return name && !PRIVATE_USE.test(name) ? name : null;
}

// Codes with no standard name, checked against the printings using them.
const LANGUAGES: Record<string, string> = {
  ph: "Phyrexian",
  qya: "Quenya",
  zhs: "Chinese (Simplified)",
  zht: "Chinese (Traditional)",
};

// Falls back to the code: the artifact carries whatever Scryfall does.
export function language(code: string): string {
  const known = LANGUAGES[code];
  if (known) return known;
  try {
    const names = new Intl.DisplayNames(undefined, {
      type: "language",
      fallback: "none",
    });
    return names.of(code) ?? code;
  } catch {
    return code;
  }
}

// A camelCase name from the artifact as something to put on screen.
export function words(name: string): string {
  return name.replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase();
}

function columns(file: string, held: string[], read: string[]) {
  if (held.join() !== read.join()) {
    throw new Error(
      `${file} holds ${held.join()}, this client reads ${read.join()}`,
    );
  }
}

// A bitmask against the list the file names it with.
function decode(mask: number, names: string[]): string[] {
  return names.filter((_, bit) => mask & (1 << bit));
}

export class Catalog {
  readonly version: string;
  #cards: CardFile;
  #prints: PrintFile;
  // Where each card's run of printings starts, with the total on the end.
  #offsets: Int32Array;
  #index: Index;
  // A bit per entry of the prints file's `langs`, all 19 in one integer.
  #languages: Int32Array;

  constructor(cards: CardFile, prints: PrintFile) {
    if (cards.version !== prints.version) {
      throw new Error(
        `catalog halves disagree: ${cards.version} and ${prints.version}`,
      );
    }

    columns("cards", cards.fields, CARD_FIELDS);
    columns("prints", prints.fields, PRINT_FIELDS);

    // A JavaScript shift is taken modulo 32, so a 32nd language would alias
    // onto the first rather than fail.
    if (prints.langs.length > 31) {
      throw new Error(`${prints.langs.length} languages exceed a bitmask`);
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

    // A total that disagrees would shift every card past the first bad one.
    if (offset !== prints.prints.length) {
      throw new Error(
        `catalog claims ${offset} printings and holds ${prints.prints.length}`,
      );
    }

    this.#languages = new Int32Array(cards.cards.length);
    for (let card = 0; card < cards.cards.length; card++) {
      let langs = 0;
      const end = this.#offsets[card + 1] as number;
      for (let at = this.#offsets[card] as number; at < end; at++) {
        langs |= 1 << (prints.prints[at] as PrintRow)[7];
      }
      this.#languages[card] = langs;
    }

    this.#index = {
      names: cards.cards.map((row) => normalize(row[1])),
      kinds: cards.cards.map((row) => row[7]),
      scores: scores(
        cards.cards.map((row) => row[9]),
        cards.cards.map((row) => row[8]),
      ),
      kindCount: cards.kinds.length,
    };
  }

  get cards(): number {
    return this.#cards.cards.length;
  }

  get printings(): number {
    return this.#prints.prints.length;
  }

  // Every language some printing is in, commonest first.
  get languages(): string[] {
    return this.#prints.langs;
  }

  // A language narrows to cards printed in it, which is not searching by a
  // name in that language: "Counterspell" with `ja` finds 対抗呪文.
  search(query: string, { limit = 50, lang = "" } = {}): Card[] {
    const bit = lang ? this.#prints.langs.indexOf(lang) : -1;
    const keep =
      bit < 0
        ? undefined
        : (card: number) =>
            ((this.#languages[card] as number) >> bit) % 2 === 1;

    return search(this.#index, query, limit, keep).map((index) =>
      this.card(index),
    );
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
      stats: row[10],
      flags: decode(row[11], this.#cards.flags),
    };
  }

  // Every paper printing, in the order search shows them.
  prints(index: number, lang = ""): Print[] {
    const start = this.#offsets[index];
    const end = this.#offsets[index + 1];
    if (start === undefined || end === undefined) {
      throw new RangeError(`no card ${index}`);
    }

    const prints: Print[] = [];
    for (let i = start; i < end; i++) {
      const print = this.#print(this.#prints.prints[i] as PrintRow);
      if (!lang || print.lang === lang) prints.push(print);
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
      finishes: decode(row[3], this.#prints.finishes),
      rarity: this.#prints.rarities[row[4]] as string,
      layout: this.#prints.layouts[row[5]] as string,
      imageStatus: this.#prints.imageStatuses[row[6]] as string,
      lang: this.#prints.langs[row[7]] as string,
      printedName: row[8],
      artist: row[9] === null ? null : (this.#prints.artists[row[9]] ?? null),
      flags: decode(row[10], this.#prints.flags),
    };
  }
}
