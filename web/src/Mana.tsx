// Scryfall writes a cost as `{2}{R}{R}`. A symbol can be hybrid: `{U/B}` is
// either color, `{2/W}` is two generic or white, `{U/P}` is blue or two life,
// and `{G/W/P}` is all three at once.
const SYMBOL = /\{([^}]+)\}/g;

const HUE: Record<string, string> = {
  W: "#fffbd5",
  U: "#aae0fa",
  B: "#cbc2bf",
  R: "#f9aa8f",
  G: "#9bd3ae",
};

const GENERIC = "#cac5c0";

// Scryfall publishes an SVG per symbol, named for the symbol stripped of its
// braces and slashes. Two aren't, and neither appears in a mana cost.
const NAMED: Record<string, string> = { "½": "HALF", "∞": "INFINITY" };

// Hotlinked, as card images are: the graphics are Wizards', and `docs/ip.md`
// says what carrying them obliges.
function svg(symbol: string) {
  const name = NAMED[symbol] ?? symbol.replace(/[{}/]/g, "");
  return `https://svgs.scryfall.io/card-symbols/${name}.svg`;
}

export function Mana({ cost }: { cost: string }) {
  const symbols = [...cost.matchAll(SYMBOL)].map(
    (match) => match[1] as string,
  );
  return (
    <span className="mana">
      {symbols.map((symbol, at) => {
        const { label, background } = pip(symbol);
        return (
          // biome-ignore lint/suspicious/noArrayIndexKey: a cost repeats symbols and never reorders, so position is the only stable key it has
          <abbr key={`${symbol}-${at}`} title={symbol} style={{ background }}>
            {label}
            <img src={svg(symbol)} alt="" />
          </abbr>
        );
      })}
    </span>
  );
}

// Phyrexian mana is the phi it is printed with rather than a letter, which
// also keeps a three-part symbol down to one glyph.
function pip(symbol: string) {
  const parts = symbol.split("/");
  const colors = parts.filter((part) => part !== "P");
  const hues = colors.map((part) => HUE[part] ?? GENERIC);

  return {
    label: parts.includes("P") ? "Φ" : colors.join(""),
    background:
      hues.length > 1
        ? `linear-gradient(135deg, ${hues[0]} 50%, ${hues[1]} 50%)`
        : hues[0],
  };
}
