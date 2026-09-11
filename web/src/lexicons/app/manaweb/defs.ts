import type * as ComAtprotoRepoStrongRef from '../../com/atproto/repo/strongRef.js'

/** A card a design refers to, owned or not. Identity is (oracleId, scryfallId, finish). */
export interface DesignEntry {
  $type?: 'app.manaweb.defs#designEntry'
  /** Scryfall oracle id: the card, not a printing. */
  oracleId: string
  /** Scryfall print id, when the printing is deliberate. Absent means any printing. */
  scryfallId?: string
  /** Intended finish. Absent means any. */
  finish?: 'nonfoil' | 'foil' | 'etched' | (string & {})
  /** Copies this entry calls for. */
  quantity: number
  /** Which part of the deck. Absent means main; lists ignore it. */
  section?: 'main' | 'side' | 'commander' | 'maybe' | (string & {})
}

/** Whether this AppView surfaces the record. Not access control: atproto records are publicly fetchable regardless. Absent means unlisted. */
export type Visibility = 'unlisted' | 'published' | (string & {})

/** Where a design was forked from. */
export interface ForkRef {
  $type?: 'app.manaweb.defs#forkRef'
  source: ComAtprotoRepoStrongRef.Main
  /** The snapshot forked from, when it wasn't current state. */
  snapshot?: string
}

/** One invertible edit to a design's entries. */
export interface Change {
  $type?: 'app.manaweb.defs#change'
  at: string
  op: 'add' | 'remove' | 'setQuantity' | (string & {})
  entry: DesignEntry
  /** Quantity before the change; what makes the edit invertible. */
  previousQuantity?: number
}
