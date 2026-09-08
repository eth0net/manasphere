import { language, type Print, words } from "./catalog";

export function Language({ code }: { code: string }) {
  return (
    <span className="tag" title={language(code)}>
      {code}
    </span>
  );
}

// One printing, as much of it as it has. Language is a tag of its own.
export function describe(print: Print) {
  return [
    `${print.setName} · ${print.set.toUpperCase()} #${print.collectorNumber}`,
    print.rarity,
    print.finishes.join("/"),
    print.artist,
    ...print.flags.map(words),
  ]
    .filter(Boolean)
    .join(" · ");
}
