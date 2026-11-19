export type UpdateStatusType =
  | 'checking'
  | 'update-available'
  | 'update-not-available'
  | 'download-progress'
  | 'update-downloaded'
  | 'error'

export interface UpdateStatusEvent {
  type: UpdateStatusType
  version?: string
  releaseNotes?: string
  percent?: number
  message?: string
}

export interface UpdaterPrefs {
  autoCheck: boolean
  autoDownload: boolean
  ignoredVersion?: string
}

export interface UpdaterApi {
  getVersion(): Promise<string>
  checkForUpdates(): Promise<void>
  downloadUpdate(): Promise<void>
  quitAndInstall(): Promise<void>
  setPrefs(prefs: UpdaterPrefs): void
  onStatus(listener: (event: UpdateStatusEvent) => void): () => void
}
