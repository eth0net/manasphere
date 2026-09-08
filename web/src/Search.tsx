import { useMemo, useState } from "react";
import {
  appLanguage,
  type Card,
  type Catalog,
  cardName,
  image,
  language,
  type Print,
  words,
} from "./catalog";
import { Mana } from "./Mana";

// Nothing renders behind these, so a thumbnail would be a broken image.
const NO_IMAGE = new Set(["missing", "placeholder"]);

// Card names are read in the app's language, not the printing's. A setting of
// its own once there is somewhere to put it — see `docs/search.md`.
const APP = appLanguage();

export function Search({ catalog }: { catalog: Catalog }) {
  const [query, setQuery] = useState("");
  const [lang, setLang] = useState("");

  // A few milliseconds per keystroke, so no debounce.
  const found = useMemo(
    () => catalog.search(query, { lang }),
    [catalog, query, lang],
  );

  return (
    <>
      <div className="query">
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search cards"
        />
        <select value={lang} onChange={(event) => setLang(event.target.value)}>
          <option value="">Any language</option>
          {catalog.languages.map((code) => (
            <option key={code} value={code}>
              {language(code)}
            </option>
          ))}
        </select>
      </div>

      {query && found.length === 0 && (
        <p>
          Nothing matches “{query}”
          {lang && ` with a ${language(lang)} printing`}.
        </p>
      )}
      <ol className="results">
        {found.map((card) => (
          <Result
            key={card.oracleId}
            card={card}
            catalog={catalog}
            lang={lang}
          />
        ))}
      </ol>
    </>
  );
}

function Result({
  card,
  catalog,
  lang,
}: {
  card: Card;
  catalog: Catalog;
  lang: string;
}) {
  const [open, setOpen] = useState(false);

  // Filtered, so the printing shown answers the search. The first of the run
  // is the one to lead with.
  const print = catalog.prints(card.index, lang)[0];
  const tags = card.kind === "card" ? card.flags : [card.kind, ...card.flags];
  const name = cardName(card.name, print, APP);

  return (
    <li>
      {print && !NO_IMAGE.has(print.imageStatus) && (
        <img src={image(print.id, "small")} alt="" loading="lazy" />
      )}
      <div>
        <h2>
          {name.text}
          {/* Only when the printing isn't in the language it is read in, so
              an English name over an English printing says nothing. */}
          {print && print.lang !== name.lang && <Language code={print.lang} />}
          {tags.map((tag) => (
            <span className="tag" key={tag}>
              {words(tag)}
            </span>
          ))}
        </h2>
        <p>
          {card.typeLine}
          {card.stats && <span className="stats">{card.stats}</span>}
          {card.manaCost && <Mana cost={card.manaCost} />}
        </p>
        {print && <p className="print">{describe(print)}</p>}
        <p className="print">
          <button
            type="button"
            className="link"
            onClick={() => setOpen(!open)}
          >
            {card.printings === 1
              ? "one printing"
              : `${card.printings} printings`}
          </button>
          {card.edhrecRank && ` · EDHREC #${card.edhrecRank.toLocaleString()}`}
        </p>
        {open && (
          <ul className="printings">
            {catalog.prints(card.index).map((one) => (
              <li key={one.id}>
                {one.lang !== "en" && <Language code={one.lang} />}
                {describe(one)}
              </li>
            ))}
          </ul>
        )}
      </div>
    </li>
  );
}

function Language({ code }: { code: string }) {
  return (
    <span className="tag" title={language(code)}>
      {code}
    </span>
  );
}

// One printing, as much of it as it has. Language is a tag of its own.
function describe(print: Print) {
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
