const STX = 0x02
const EOT = 0x04
const ACK = 0x06
const NAK = 0x15
const CAN = 0x18
const CRC_REQUEST = 0x43
const BLOCK_SIZE = 1024
const PADDING = 0x1a

export interface XmodemTransport {
  write(data: Uint8Array): Promise<void>
  onData(listener: (data: Uint8Array) => void): () => void
  onError(listener: (error: Error) => void): () => void
  onDisconnect(listener: () => void): () => void
}

export interface XmodemProgress {
  transferredBytes: number
  packet: number
  totalPackets: number
  retries: number
}

interface PendingControl {
  accepted: readonly number[]
  resolve(value: number): void
  reject(error: Error): void
  timer: ReturnType<typeof setTimeout>
}

class XmodemTimeoutError extends Error {}

export function crc16Xmodem(data: Uint8Array): number {
  let crc = 0
  for (const byte of data) {
    crc ^= byte << 8
    for (let bit = 0; bit < 8; bit++) {
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff
    }
  }
  return crc
}

export function createXmodem1KPacket(
  firmware: Uint8Array,
  offset: number,
  sequence: number,
): Uint8Array {
  if (offset < 0 || offset >= firmware.length) throw new RangeError('Invalid Xmodem offset')
  const packet = new Uint8Array(BLOCK_SIZE + 5)
  packet.fill(PADDING)
  packet[0] = STX
  packet[1] = sequence & 0xff
  packet[2] = 255 - (sequence & 0xff)
  packet.set(firmware.subarray(offset, Math.min(offset + BLOCK_SIZE, firmware.length)), 3)
  const crc = crc16Xmodem(packet.subarray(3, BLOCK_SIZE + 3))
  packet[BLOCK_SIZE + 3] = crc >> 8
  packet[BLOCK_SIZE + 4] = crc & 0xff
  return packet
}

export class XmodemSender {
  private controls: number[] = []
  private pending: PendingControl | undefined
  private removeData: (() => void) | undefined
  private removeError: (() => void) | undefined
  private removeDisconnect: (() => void) | undefined
  private abortHandler: (() => void) | undefined
  private abortSignal: AbortSignal | undefined
  private listening = false

  constructor(private readonly transport: XmodemTransport) {}

  listen(signal: AbortSignal): void {
    if (this.listening) return
    this.controls = []
    this.pending = undefined
    this.listening = true
    this.abortSignal = signal
    this.removeData = this.transport.onData((data) => this.acceptData(data))
    this.removeError = this.transport.onError((error) => this.fail(error))
    this.removeDisconnect = this.transport.onDisconnect(() =>
      this.fail(new Error('串口已断开，传输中止')),
    )
    this.abortHandler = () =>
      this.fail(signal.reason instanceof Error ? signal.reason : new Error('操作已取消'))
    signal.addEventListener('abort', this.abortHandler, { once: true })
  }

  dispose(): void {
    if (!this.listening) return
    this.removeData?.()
    this.removeError?.()
    this.removeDisconnect?.()
    if (this.abortSignal && this.abortHandler) {
      this.abortSignal.removeEventListener('abort', this.abortHandler)
    }
    this.listening = false
    this.abortSignal = undefined
    this.abortHandler = undefined
    this.removeData = undefined
    this.removeError = undefined
    this.removeDisconnect = undefined
    this.pending = undefined
    this.controls = []
  }

  async send(
    firmware: Uint8Array,
    signal: AbortSignal,
    onProgress: (progress: XmodemProgress) => void,
  ): Promise<void> {
    if (firmware.length === 0) throw new Error('固件文件为空')
    this.listen(signal)
    let retries = 0
    const totalPackets = Math.ceil(firmware.length / BLOCK_SIZE)

    try {
      this.throwIfAborted(signal)
      const start = await this.waitControl([CRC_REQUEST, CAN], 15000)
      if (start === CAN) throw new Error('设备中止了 Xmodem 传输')

      for (let index = 0; index < totalPackets; index++) {
        const offset = index * BLOCK_SIZE
        const packet = createXmodem1KPacket(firmware, offset, index + 1)
        let acknowledged = false
        for (let attempt = 0; attempt <= 10; attempt++) {
          this.throwIfAborted(signal)
          await this.transport.write(packet)
          try {
            const response = await this.waitControl([ACK, NAK, CAN], 5000)
            if (response === CAN) throw new Error('设备中止了 Xmodem 传输')
            if (response === ACK) {
              acknowledged = true
              break
            }
            retries++
          } catch (error) {
            if (!(error instanceof XmodemTimeoutError)) throw error
            retries++
          }
          onProgress({ transferredBytes: offset, packet: index, totalPackets, retries })
        }
        if (!acknowledged) throw new Error(`第 ${index + 1} 包超过最大重试次数`)
        const transferredBytes = Math.min(offset + BLOCK_SIZE, firmware.length)
        onProgress({ transferredBytes, packet: index + 1, totalPackets, retries })
      }

      for (let attempt = 0; attempt <= 10; attempt++) {
        this.throwIfAborted(signal)
        await this.transport.write(Uint8Array.of(EOT))
        try {
          const response = await this.waitControl([ACK, NAK, CAN], 5000)
          if (response === CAN) throw new Error('设备中止了 Xmodem 传输')
          if (response === ACK) return
          retries++
        } catch (error) {
          if (!(error instanceof XmodemTimeoutError)) throw error
          retries++
        }
        if (attempt >= 10) throw new Error('结束传输时超过最大重试次数')
        onProgress({
          transferredBytes: firmware.length,
          packet: totalPackets,
          totalPackets,
          retries,
        })
      }
    } finally {
      this.dispose()
    }
  }

  private acceptData(data: Uint8Array): void {
    for (const byte of data) {
      if (byte !== ACK && byte !== NAK && byte !== CAN && byte !== CRC_REQUEST) continue
      const pending = this.pending
      if (pending && pending.accepted.includes(byte)) {
        this.pending = undefined
        clearTimeout(pending.timer)
        pending.resolve(byte)
      } else {
        this.controls.push(byte)
      }
    }
  }

  private waitControl(accepted: readonly number[], timeoutMs: number): Promise<number> {
    while (this.controls.length > 0) {
      const value = this.controls.shift()!
      if (accepted.includes(value)) return Promise.resolve(value)
    }
    return new Promise<number>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending = undefined
        reject(new XmodemTimeoutError('等待设备 Xmodem 应答超时'))
      }, timeoutMs)
      this.pending = { accepted, resolve, reject, timer }
    })
  }

  private fail(error: Error): void {
    const pending = this.pending
    if (!pending) return
    this.pending = undefined
    clearTimeout(pending.timer)
    pending.reject(error)
  }

  private throwIfAborted(signal: AbortSignal): void {
    if (signal.aborted) {
      throw signal.reason instanceof Error ? signal.reason : new Error('操作已取消')
    }
  }
}
