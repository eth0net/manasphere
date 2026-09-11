import type * as AppManawebDefs from './defs.js'

export interface Main {
  $type: 'app.manaweb.deck'
  name: string
  description?: string
  /** Scryfall's legality keys, so a card can be checked by lookup. */
  format?:
    | 'alchemy'
    | 'brawl'
    | 'commander'
    | 'duel'
    | 'gladiator'
    | 'historic'
    | 'legacy'
    | 'modern'
    | 'oathbreaker'
    | 'oldschool'
    | 'pauper'
    | 'paupercommander'
    | 'penny'
    | 'pioneer'
    | 'predh'
    | 'premodern'
    | 'standard'
    | 'standardbrawl'
    | 'timeless'
    | 'vintage'
    | (string & {})
  /** The design. Order is not meaningful. */
  entries?: AppManawebDefs.DesignEntry[]
  /** The deck box this deck occupies. Its presence scopes what "built" means. */
  container?: string
  /** Drops the deck out of default listings. Reversible, and the only stored state. */
  archived?: boolean
  visibility?: AppManawebDefs.Visibility
  forkedFrom?: AppManawebDefs.ForkRef
  /** Recent edits, newest first. How many to keep is client policy. */
  recentChanges?: AppManawebDefs.Change[]
  createdAt: string
  updatedAt?: string
  [k: string]: unknown
}
