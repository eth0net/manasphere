import type * as ComAtprotoRepoStrongRef from '../../com/atproto/repo/strongRef.js'
import type * as AppManawebDefs from './defs.js'

export interface Main {
  $type: 'app.manaweb.snapshot'
  subject: ComAtprotoRepoStrongRef.Main
  /** What the version is called. Absent for an automatic snapshot. */
  name?: string
  /** Written by the client rather than named by a person. */
  automatic?: boolean
  /** Complete contents, not a diff. */
  entries: AppManawebDefs.DesignEntry[]
  createdAt: string
  [k: string]: unknown
}
