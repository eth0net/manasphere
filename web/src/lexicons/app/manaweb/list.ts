import type * as AppManawebDefs from './defs.js'

export interface Main {
  $type: 'app.manaweb.list'
  name: string
  description?: string
  /** What the list is for. Drives visibility defaults. */
  purpose?: 'wishlist' | 'trade' | 'staging' | 'other' | (string & {})
  /** Larger ceiling than a deck; a cube or bulk trade pile is a list. */
  entries?: AppManawebDefs.DesignEntry[]
  visibility?: AppManawebDefs.Visibility
  forkedFrom?: AppManawebDefs.ForkRef
  recentChanges?: AppManawebDefs.Change[]
  createdAt: string
  updatedAt?: string
  [k: string]: unknown
}
