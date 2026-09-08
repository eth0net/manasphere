import { Modal } from "./Modal";

// The detail behind the footer's disclaimer. Belongs in a settings or help
// section once there is one; a modal until then.
export function Licenses() {
  return (
    <Modal label="Licenses" trigger="link" title="Licenses">
      <dl>
        <dt>Manasphere</dt>
        <dd>
          AGPL-3.0-only —{" "}
          <a href="https://github.com/eth0net/manasphere">source</a>
        </dd>

        <dt>Card names, text and mana symbols</dt>
        <dd>
          ©Wizards of the Coast LLC, used under the{" "}
          <a href="https://company.wizards.com/en/legal/fancontentpolicy">
            Fan Content Policy
          </a>
        </dd>

        <dt>Card data and images</dt>
        <dd>
          <a href="https://scryfall.com">Scryfall</a>, under their{" "}
          <a href="https://scryfall.com/docs/api">API terms</a>. Hotlinked
          rather than redistributed, and not endorsed by Scryfall.
        </dd>

        <dt>React, React DOM</dt>
        <dd>MIT</dd>
      </dl>
    </Modal>
  );
}
