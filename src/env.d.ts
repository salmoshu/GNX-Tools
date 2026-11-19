import type { GnxApi } from '../shared/flash'
import type { UpdaterApi } from '../shared/update'

declare global {
  interface Window {
    gnx: GnxApi
    updater: UpdaterApi
  }
}

export {}
