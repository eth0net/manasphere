export interface Main {
  $type: 'app.manaweb.card'
  /** Scryfall print id: the exact printing, which also pins the language. */
  scryfallId: string
  /** Part of what identifies these copies; foil and nonfoil are separate records. */
  finish: 'nonfoil' | 'foil' | 'etched' | (string & {})
  /** Copies owned now. Deleted rather than kept at zero. */
  quantity: number
  /** The Cardmarket scale, as ManaBox exports. Absent means ungraded. */
  condition?:
    | 'mint'
    | 'nearMint'
    | 'excellent'
    | 'good'
    | 'lightPlayed'
    | 'played'
    | 'poor'
    | (string & {})
  /** The container holding these copies. Absent means unfiled. */
  container?: string
  /** How these copies were come by. History, so it need not sum to quantity. */
  acquisitions?: Acquisition[]
  /** Not a real card: fills a deck slot but counts toward no valuation. */
  proxy?: boolean
  /** Free text, and world-readable like every other field. */
  note?: string
  /** Free-form labels. Moxfield exports these. */
  tags?: ('altered' | 'misprint' | 'signed' | (string & {}))[]
  createdAt: string
  /** Client-declared, so it can be stale: a PDS records no modification time. */
  updatedAt?: string
  [k: string]: unknown
}

/** One lot of copies, and what it cost. */
export interface Acquisition {
  $type?: 'app.manaweb.card#acquisition'
  quantity: number
  /** Absent when the source didn't record it. */
  at?: string
  /** What you paid per copy, as a decimal string. Absent means you didn't say. */
  price?: string
  /** ISO 4217 for price. */
  currency?: string
  /** What a copy was worth when the row was written. */
  marketValue?: string
  /** ISO 4217 for marketValue. Scryfall quotes USD and EUR. */
  marketCurrency?: string
}
