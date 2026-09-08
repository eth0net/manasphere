import { Licenses } from "./Licenses";

// The Fan Content Policy asks for its disclaimer verbatim wherever the project
// is named, and Scryfall for a visible credit. Both are in `docs/ip.md`.
export function Footer() {
  return (
    <footer>
      <p>
        Manasphere is unofficial Fan Content permitted under the{" "}
        <a href="https://company.wizards.com/en/legal/fancontentpolicy">
          Fan Content Policy
        </a>
        . Not approved/endorsed by Wizards. Portions of the materials used are
        property of Wizards of the Coast. ©Wizards of the Coast LLC.
      </p>
      <p>
        Card data, images and mana symbols from{" "}
        <a href="https://scryfall.com">Scryfall</a>, who have not endorsed this
        project. <Licenses />
      </p>
    </footer>
  );
}
