export interface Main {
  $type: 'app.manaweb.container'
  /** Display name. Cannot be empty. */
  name: string
  /** What sort of place this is. Cosmetic. */
  kind?: 'binder' | 'box' | 'deckBox' | 'shelf' | 'other' | (string & {})
  note?: string
  createdAt: string
  [k: string]: unknown
}
