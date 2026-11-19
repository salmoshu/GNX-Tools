import { SerialPort } from 'serialport'
import type { SerialPortInfo } from '../../shared/flash'

export class SerialTransport {
  private port: SerialPort | undefined
  private intentionalClose = false
  private readonly dataListeners = new Set<(data: Uint8Array) => void>()
  private readonly errorListeners = new Set<(error: Error) => void>()
  private readonly disconnectListeners = new Set<() => void>()

  get isOpen(): boolean {
    return this.port?.isOpen ?? false
  }

  get path(): string {
    return this.isOpen ? (this.port?.path ?? '') : ''
  }

  get baudRate(): number {
    return this.isOpen ? (this.port?.baudRate ?? 0) : 0
  }

  async listPorts(): Promise<SerialPortInfo[]> {
    const ports = await SerialPort.list()
    return ports.map((port) => ({
      path: port.path,
      friendlyName: port.friendlyName ?? port.path,
      manufacturer: port.manufacturer,
    }))
  }

  async open(path: string, baudRate: number): Promise<void> {
    if (!path) throw new Error('请选择串口')
    this.validateBaudRate(baudRate)
    if (this.isOpen && this.path === path) {
      await this.updateBaudRate(baudRate)
      return
    }
    await this.close()

    const port = new SerialPort({
      path,
      baudRate,
      dataBits: 8,
      stopBits: 1,
      parity: 'none',
      rtscts: false,
      autoOpen: false,
    })
    this.port = port
    port.on('data', (chunk: Uint8Array) => {
      for (const listener of this.dataListeners) listener(chunk)
    })
    port.on('error', (error) => {
      for (const listener of this.errorListeners) listener(error)
    })
    port.once('close', () => {
      const intentional = this.intentionalClose
      this.intentionalClose = false
      if (this.port === port) this.port = undefined
      if (!intentional) {
        for (const listener of this.disconnectListeners) listener()
      }
    })

    await new Promise<void>((resolve, reject) => {
      port.open((error) => (error ? reject(error) : resolve()))
    })
    await new Promise<void>((resolve, reject) => {
      port.set({ rts: true, dtr: false }, (error) => (error ? reject(error) : resolve()))
    })
  }

  async updateBaudRate(baudRate: number): Promise<void> {
    this.validateBaudRate(baudRate)
    const port = this.port
    if (!port?.isOpen) throw new Error('串口未打开')
    if (port.baudRate === baudRate) return
    await new Promise<void>((resolve, reject) => {
      port.update({ baudRate }, (error) => (error ? reject(error) : resolve()))
    })
  }

  async write(data: Uint8Array): Promise<void> {
    const port = this.port
    if (!port?.isOpen) throw new Error('串口未打开')
    await new Promise<void>((resolve, reject) => {
      port.write(Buffer.from(data), (writeError) => {
        if (writeError) {
          reject(writeError)
          return
        }
        port.drain((drainError) => (drainError ? reject(drainError) : resolve()))
      })
    })
  }

  async close(): Promise<void> {
    const port = this.port
    if (!port) return
    if (!port.isOpen) {
      if (this.port === port) this.port = undefined
      return
    }
    this.intentionalClose = true
    await new Promise<void>((resolve, reject) => {
      port.close((error) => (error ? reject(error) : resolve()))
    })
    if (this.port === port) this.port = undefined
  }

  onData(listener: (data: Uint8Array) => void): () => void {
    this.dataListeners.add(listener)
    return () => this.dataListeners.delete(listener)
  }

  onError(listener: (error: Error) => void): () => void {
    this.errorListeners.add(listener)
    return () => this.errorListeners.delete(listener)
  }

  onDisconnect(listener: () => void): () => void {
    this.disconnectListeners.add(listener)
    return () => this.disconnectListeners.delete(listener)
  }

  private validateBaudRate(value: number): void {
    if (!Number.isInteger(value) || value <= 0 || value > 12000000) {
      throw new Error('无效的串口波特率')
    }
  }
}
