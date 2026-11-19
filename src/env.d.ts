import type { GnxApi } from '../shared/flash'

declare global {
  interface Window {
    gnx: GnxApi
  }
}

export {}
