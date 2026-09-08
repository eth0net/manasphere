// Scryfall writes a cost as `{2}{R}{R}`, so the braces are the delimiters.
const SYMBOL = /\{([^}]+)\}/g;

export function Mana({ cost }: { cost: string }) {
  const symbols = [...cost.matchAll(SYMBOL)].map(
    (match) => match[1] as string,
  );
  return (
    <span className="mana">
      {symbols.map((symbol, at) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: a cost repeats symbols and never reorders, so position is the only stable key it has
        <abbr key={`${symbol}-${at}`} data-mana={symbol} title={symbol}>
          {symbol}
        </abbr>
      ))}
    </span>
  );
}
