import { type Card, type Catalog, image } from "./catalog";
import { Add } from "./collection/Add";
import { Modal } from "./Modal";
import { describe, hasArt, Language } from "./Printing";

// Art is what a printing is chosen by, which a line of text cannot carry.
export function Printings({
  card,
  catalog,
  name,
}: {
  card: Card;
  catalog: Catalog;
  name: string;
}) {
  return (
    <Modal
      wide
      trigger="link"
      title={name}
      label={`${card.printings} printing${card.printings === 1 ? "" : "s"}`}
    >
      <ul className="prints">
        {catalog.prints(card.index).map((one) => (
          <li key={one.id}>
            {hasArt(one) ? (
              <img src={image(one.id, "small")} alt="" loading="lazy" />
            ) : (
              <span className="noart" />
            )}
            <span className="what">
              {one.lang !== "en" && <Language code={one.lang} />}
              {describe(one)}
            </span>
            <Add print={one} />
          </li>
        ))}
      </ul>
    </Modal>
  );
}
