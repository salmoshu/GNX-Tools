export const BOOT_BAUD_RATE = 12800
export const LOADER_BAUD_RATE = 921600

export type DeviceMode = 'unknown' | 'boot' | 'loader'
export type EntryMode = Exclude<DeviceMode, 'unknown'>
export type FlashOperation =
  | 'host'
  | 'gnss'
  | 'loader-boot'
  | 'loader-loader'
  | 'loader-backup'

export type FlashPhase =
  | 'idle'
  | 'connecting'
  | 'waiting-reset'
  | 'entering'
  | 'ready'
  | 'transferring'
  | 'success'
  | 'error'
  | 'cancelled'

export interface SerialPortInfo {
  path: string
  friendlyName: string
  manufacturer?: string
}

export interface FirmwareFile {
  path: string
  name: string
  size: number
}

export interface SerialSettings {
  bootBaudRate: number
  loaderBaudRate: number
}

export interface FlashRequest {
  port: string
  operation: FlashOperation
  filePath: string
  settings?: SerialSettings
}

export interface EntryRequest {
  port: string
  mode: EntryMode
  settings?: SerialSettings
}

export interface CommandRequest {
  port: string
  command: string
}

export interface FlashSnapshot {
  phase: FlashPhase
  busy: boolean
  connected: boolean
  port: string
  baudRate: number
  mode: DeviceMode
  operation: FlashOperation | null
  message: string
  fileName: string
  fileSize: number
  transferredBytes: number
  progress: number
  packet: number
  totalPackets: number
  retries: number
  elapsedMs: number
}

export type LogLevel = 'info' | 'success' | 'warning' | 'error' | 'rx' | 'tx'

export interface LogEntry {
  timestamp: number
  level: LogLevel
  message: string
}

export type FlashEvent =
  | { type: 'state'; snapshot: FlashSnapshot }
  | { type: 'log'; entry: LogEntry }

export const EMPTY_FLASH_SNAPSHOT: FlashSnapshot = {
  phase: 'idle',
  busy: false,
  connected: false,
  port: '',
  baudRate: LOADER_BAUD_RATE,
  mode: 'unknown',
  operation: null,
  message: '请选择串口和固件文件',
  fileName: '',
  fileSize: 0,
  transferredBytes: 0,
  progress: 0,
  packet: 0,
  totalPackets: 0,
  retries: 0,
  elapsedMs: 0,
}

export interface WindowState {
  maximized: boolean
}

export interface GnxApi {
  listPorts(): Promise<SerialPortInfo[]>
  chooseFile(): Promise<FirmwareFile | null>
  getSnapshot(): Promise<FlashSnapshot>
  open(port: string, loaderBaudRate?: number): Promise<FlashSnapshot>
  close(): Promise<FlashSnapshot>
  enter(request: EntryRequest): Promise<FlashSnapshot>
  flash(request: FlashRequest): Promise<FlashSnapshot>
  cancel(): Promise<void>
  command(request: CommandRequest): Promise<FlashSnapshot>
  onEvent(listener: (event: FlashEvent) => void): () => void
  minimizeWindow(): Promise<void>
  toggleMaximizeWindow(): Promise<boolean>
  closeWindow(): Promise<void>
  onWindowState(listener: (state: WindowState) => void): () => void
}
