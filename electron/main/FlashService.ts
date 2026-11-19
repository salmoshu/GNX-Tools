import fs from 'node:fs/promises'
import path from 'node:path'
import {
  BOOT_BAUD_RATE,
  EMPTY_FLASH_SNAPSHOT,
  LOADER_BAUD_RATE,
  type CommandRequest,
  type DeviceMode,
  type EntryMode,
  type EntryRequest,
  type FlashEvent,
  type FlashOperation,
  type FlashPhase,
  type FlashRequest,
  type FlashSnapshot,
  type LogLevel,
  type SerialSettings,
} from '../../shared/flash'
import { SerialTransport } from './SerialTransport'
import { XmodemSender } from './Xmodem'

interface OperationDefinition {
  mode: EntryMode
  command: string
  name: string
}

const OPERATIONS: Record<FlashOperation, OperationDefinition> = {
  host: { mode: 'loader', command: '1', name: 'HOST 固件' },
  gnss: { mode: 'loader', command: '2', name: 'GNSS 固件' },
  'loader-boot': { mode: 'boot', command: '4', name: 'Loader 固件（Boot 直接更新）' },
  'loader-loader': { mode: 'loader', command: '6', name: 'Loader 固件（Loader 更新）' },
  'loader-backup': { mode: 'boot', command: '1', name: 'Loader 固件（Boot 备份更新）' },
}

export class FlashService {
  readonly transport = new SerialTransport()
  private snapshot: FlashSnapshot = { ...EMPTY_FLASH_SNAPSHOT }
  private settings: SerialSettings = {
    bootBaudRate: BOOT_BAUD_RATE,
    loaderBaudRate: LOADER_BAUD_RATE,
  }
  private abortController: AbortController | undefined
  private cancelRequested = false
  private startedAt = 0
  private rxText = ''
  private xmodemActive = false
  private xmodemLogBytes = 0

  constructor(private readonly emitEvent: (event: FlashEvent) => void) {
    this.transport.onData((data) => this.acceptData(data))
    this.transport.onError((error) => this.log('error', `串口错误：${error.message}`))
    this.transport.onDisconnect(() => {
      this.update({
        mode: 'unknown',
        phase: this.snapshot.busy ? 'error' : 'idle',
        message: '串口已断开',
      })
      if (this.snapshot.busy) this.abortController?.abort(new Error('串口已断开，操作中止'))
    })
  }

  getSnapshot(): FlashSnapshot {
    return this.synchronizedSnapshot()
  }

  async listPorts() {
    return this.transport.listPorts()
  }

  async open(port: string, loaderBaudRate?: number): Promise<FlashSnapshot> {
    this.ensureIdle()
    if (loaderBaudRate !== undefined) {
      this.applySettings({
        ...this.settings,
        loaderBaudRate,
      })
    }
    await this.transport.open(port, this.settings.loaderBaudRate)
    this.rxText = ''
    this.update({
      phase: 'ready',
      mode: 'unknown',
      port,
      message: `串口 ${port} 已打开`,
    })
    this.log('success', `串口 ${port} 已打开，${this.settings.loaderBaudRate} baud，8N1`)
    return this.getSnapshot()
  }

  async close(): Promise<FlashSnapshot> {
    this.ensureIdle()
    await this.transport.close()
    this.rxText = ''
    this.update({
      phase: 'idle',
      mode: 'unknown',
      message: '串口已关闭',
    })
    return this.getSnapshot()
  }

  async enter(request: EntryRequest): Promise<FlashSnapshot> {
    return this.run(null, request.settings, 'ready', async (signal) => {
      await this.ensureOpen(request.port, this.openingRateForMode(request.mode))
      await this.enterMode(request.mode, signal)
      const name = request.mode === 'boot' ? 'Boot' : 'Loader'
      this.update({ message: `已进入 ${name}，可执行后续操作` })
    })
  }

  async flash(request: FlashRequest): Promise<FlashSnapshot> {
    if (!request.filePath) throw new Error('请选择固件文件')
    const definition = OPERATIONS[request.operation]
    if (!definition) throw new Error('不支持的烧录类型')
    return this.run(request.operation, request.settings, 'success', async (signal) => {
      const firmware = new Uint8Array(await fs.readFile(request.filePath))
      if (firmware.length === 0) throw new Error('固件文件为空')
      this.update({
        fileName: path.basename(request.filePath),
        fileSize: firmware.length,
        totalPackets: Math.ceil(firmware.length / 1024),
        message: `已加载 ${definition.name}`,
      })
      this.log('info', `固件：${request.filePath}（${firmware.length} 字节）`)

      await this.ensureOpen(request.port, this.openingRateForMode(definition.mode))
      await this.enterMode(definition.mode, signal)
      this.update({ phase: 'entering', message: `准备烧录 ${definition.name}` })
      this.setMode('unknown')

      const sender = new XmodemSender(this.transport)
      this.xmodemActive = true
      this.xmodemLogBytes = 0
      sender.listen(signal)
      try {
        await this.sendCommand(definition.command)
        this.update({
          phase: 'transferring',
          message: '等待设备发起 Xmodem-1K CRC 握手',
        })
        await sender.send(firmware, signal, (progress) => {
          this.update({
            phase: 'transferring',
            transferredBytes: progress.transferredBytes,
            packet: progress.packet,
            totalPackets: progress.totalPackets,
            retries: progress.retries,
            progress: Math.round((progress.transferredBytes / firmware.length) * 100),
            message: `正在传输第 ${Math.max(1, progress.packet)}/${progress.totalPackets} 包`,
          })
        })
      } finally {
        sender.dispose()
        this.xmodemActive = false
      }
      this.update({
        progress: 100,
        transferredBytes: firmware.length,
        message: `${definition.name}传输完成，设备已确认接收`,
      })
      this.log('success', `${definition.name}传输完成，Xmodem EOT 已确认`)
    })
  }

  async command(request: CommandRequest): Promise<FlashSnapshot> {
    const command = request.command
    if (!/^[\x20-\x7e]{1,16}$/.test(command)) throw new Error('命令必须为 1～16 个可打印 ASCII 字符')
    return this.run(null, undefined, 'ready', async () => {
      await this.ensureOpen(request.port, this.settings.loaderBaudRate)
      await this.sendCommand(command)
      if (command === '5' || command === 'b') this.update({ mode: 'unknown' })
      this.update({ message: `命令 ${command} 已发送` })
    })
  }

  cancel(): void {
    if (!this.snapshot.busy) return
    this.cancelRequested = true
    this.abortController?.abort(new Error('操作已取消'))
  }

  async shutdown(): Promise<void> {
    this.cancel()
    await this.transport.close()
  }

  private async run(
    operation: FlashOperation | null,
    settings: SerialSettings | undefined,
    successPhase: FlashPhase,
    task: (signal: AbortSignal) => Promise<void>,
  ): Promise<FlashSnapshot> {
    this.ensureIdle()
    if (settings) this.applySettings(settings)
    this.cancelRequested = false
    this.abortController = new AbortController()
    this.startedAt = Date.now()
    this.update({
      phase: 'connecting',
      busy: true,
      operation,
      progress: 0,
      fileName: '',
      fileSize: 0,
      transferredBytes: 0,
      packet: 0,
      totalPackets: 0,
      retries: 0,
      message: '正在准备操作',
    })
    try {
      await this.taskWithSignal(task, this.abortController.signal)
      this.update({
        phase: successPhase,
        busy: false,
        message: this.snapshot.message,
      })
      if (successPhase === 'success') this.log('success', '本次烧录流程完成')
    } catch (error) {
      const failure = error instanceof Error ? error : new Error(String(error))
      const wasCancelled = this.cancelRequested
      this.update({
        phase: wasCancelled ? 'cancelled' : 'error',
        busy: false,
        message: wasCancelled ? '操作已取消' : failure.message,
      })
      this.log(wasCancelled ? 'warning' : 'error', wasCancelled ? '操作已取消' : failure.message)
    } finally {
      this.abortController = undefined
      this.xmodemActive = false
    }
    return this.getSnapshot()
  }

  private async taskWithSignal(
    task: (signal: AbortSignal) => Promise<void>,
    signal: AbortSignal,
  ): Promise<void> {
    await task(signal)
    if (signal.aborted && this.cancelRequested) throw new Error('操作已取消')
  }

  private async ensureOpen(port: string, baudRate: number): Promise<void> {
    if (!this.transport.isOpen || this.transport.path !== port) {
      this.update({ mode: 'unknown', phase: 'connecting', message: `正在打开 ${port}` })
      await this.transport.open(port, baudRate)
      this.rxText = ''
      this.log('info', `串口已打开：${port}，${baudRate} baud，8N1`)
    } else if (this.transport.baudRate !== baudRate) {
      await this.transport.updateBaudRate(baudRate)
      this.log('info', `串口波特率已切换为 ${baudRate}`)
    }
    this.update({ port, baudRate })
  }

  private async enterMode(mode: EntryMode, signal: AbortSignal): Promise<void> {
    if (this.snapshot.mode === mode) {
      this.log('info', `设备已处于 ${mode === 'boot' ? 'Boot' : 'Loader'} 界面`)
      return
    }
    if (mode === 'loader' && this.snapshot.mode === 'boot') {
      this.update({ phase: 'entering', message: '正在从 Boot 运行 Loader' })
      this.rxText = ''
      await this.sendCommand('3')
      await delay(50)
      await this.transport.updateBaudRate(this.settings.loaderBaudRate)
      await this.waitForText(
        /Please release the key|Read\s*Flash\s*ID|Update\s+Host\s*App/i,
        10000,
        signal,
      )
      await this.waitForText(/Read\s*Flash\s*ID|Update\s+Host\s*App/i, 10000, signal)
      await delay(200)
      this.setMode('loader')
      this.log('success', '已从 Boot 进入 Loader 菜单')
      return
    }
    if (mode === 'boot') await this.enterBoot(signal)
    else await this.enterLoader(signal)
  }

  private async enterBoot(signal: AbortSignal): Promise<void> {
    await this.transport.updateBaudRate(this.settings.bootBaudRate)
    this.rxText = ''
    this.setMode('unknown')
    this.update({
      phase: 'waiting-reset',
      baudRate: this.settings.bootBaudRate,
      message: '正在循环发送 x，请按一下开发板复位键',
    })
    this.log('info', '循环发送 x（间隔 1 ms），等待 Boot 菜单；请复位开发板')
    await this.loopUntil('x', /Boot\s*>>/i, 60000, signal)
    this.update({ phase: 'entering', message: '已检测到 Boot，等待完整菜单' })
    this.log('info', '检测到 Boot 提示，停止发送 x')
    await this.waitForText(/Read\s*Flash\s*ID/i, 10000, signal)
    await delay(500)
    this.setMode('boot')
    this.log('success', '已进入 Boot 菜单')
  }

  private async enterLoader(signal: AbortSignal): Promise<void> {
    await this.transport.updateBaudRate(this.settings.loaderBaudRate)
    this.rxText = ''
    this.setMode('unknown')
    this.update({
      phase: 'waiting-reset',
      baudRate: this.settings.loaderBaudRate,
      message: '正在循环发送 z，请按一下开发板复位键',
    })
    this.log('info', '循环发送 z（间隔 1 ms），等待 Loader；请复位开发板')
    await this.loopUntil('z', /Please release the key|Loader\s*>>/i, 60000, signal)
    this.update({ phase: 'entering', message: '已收到释放按键提示，等待完整 Loader 菜单' })
    this.log('info', '检测到 Please release the key，停止发送 z')
    await this.waitForText(/Read\s*Flash\s*ID|Update\s+Host\s*App/i, 10000, signal)
    await delay(200)
    this.setMode('loader')
    this.log('success', '已进入 Loader 菜单')
  }

  private async loopUntil(
    key: string,
    pattern: RegExp,
    timeoutMs: number,
    signal: AbortSignal,
  ): Promise<void> {
    const deadline = Date.now() + timeoutMs
    while (!signal.aborted && Date.now() < deadline) {
      if (pattern.test(this.rxText)) return
      await this.transport.write(Buffer.from(key, 'ascii'))
      await delay(1)
    }
    if (signal.aborted) throw abortReason(signal)
    throw new Error('等待设备菜单超时，请检查串口、波特率和复位操作')
  }

  private async waitForText(pattern: RegExp, timeoutMs: number, signal: AbortSignal): Promise<void> {
    const deadline = Date.now() + timeoutMs
    while (!signal.aborted && Date.now() < deadline) {
      if (pattern.test(this.rxText)) return
      await delay(20)
    }
    if (signal.aborted) throw abortReason(signal)
    throw new Error('等待设备响应超时')
  }

  private async sendCommand(command: string): Promise<void> {
    await this.transport.write(Buffer.from(command, 'ascii'))
    this.log('tx', `发送菜单命令：${command}`)
  }

  private acceptData(data: Uint8Array): void {
    this.rxText += Buffer.from(data).toString('latin1')
    if (this.rxText.length > 65536) this.rxText = this.rxText.slice(-32768)
    let latestMode: DeviceMode | undefined
    for (const match of this.rxText.matchAll(/(Boot|Loader)\s*>>/gi)) {
      const tail = this.rxText.slice((match.index ?? 0) + match[0].length)
      if (/^\s*Please\s+release\s+the\s+key/i.test(tail)) continue
      latestMode = match[1].toLowerCase() === 'boot' ? 'boot' : 'loader'
    }
    if (latestMode && latestMode !== this.snapshot.mode) this.setMode(latestMode)
    if (this.xmodemActive) {
      const remaining = 64 - this.xmodemLogBytes
      if (remaining > 0 && data.length > 0) {
        const preview = data.subarray(0, Math.min(remaining, data.length))
        const hex = Buffer.from(preview)
          .toString('hex')
          .toUpperCase()
          .replace(/(..)/g, '$1 ')
          .trim()
        this.log('info', `Xmodem RX 原始字节：${hex}`)
        this.xmodemLogBytes += preview.length
      }
      return
    }
    const text = Buffer.from(data)
      .toString('utf8')
      .replace(/[^\x09\x0a\x0d\x20-\x7e\u0080-\uffff]/g, '')
      .trim()
    if (text) this.log('rx', text)
  }

  private setMode(mode: DeviceMode): void {
    if (this.snapshot.mode === mode) return
    this.update({ mode })
  }

  private rateForMode(mode: EntryMode): number {
    return mode === 'boot' ? this.settings.bootBaudRate : this.settings.loaderBaudRate
  }

  private openingRateForMode(mode: EntryMode): number {
    if (mode === 'loader' && this.snapshot.mode === 'boot' && this.transport.isOpen) {
      return this.transport.baudRate
    }
    return this.rateForMode(mode)
  }

  private applySettings(settings: SerialSettings): void {
    for (const value of [settings.bootBaudRate, settings.loaderBaudRate]) {
      if (!Number.isInteger(value) || value <= 0 || value > 12000000) {
        throw new Error('波特率必须为正整数')
      }
    }
    this.settings = { ...settings }
  }

  private ensureIdle(): void {
    if (this.snapshot.busy) throw new Error('已有操作正在进行，请先完成或取消')
  }

  private update(patch: Partial<FlashSnapshot>): void {
    this.snapshot = { ...this.snapshot, ...patch }
    this.emitEvent({ type: 'state', snapshot: this.synchronizedSnapshot() })
  }

  private synchronizedSnapshot(): FlashSnapshot {
    return {
      ...this.snapshot,
      connected: this.transport.isOpen,
      port: this.transport.path || this.snapshot.port,
      baudRate: this.transport.baudRate || this.snapshot.baudRate,
      elapsedMs: this.startedAt > 0 ? Math.max(0, Date.now() - this.startedAt) : 0,
    }
  }

  private log(level: LogLevel, message: string): void {
    this.emitEvent({ type: 'log', entry: { timestamp: Date.now(), level, message } })
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function abortReason(signal: AbortSignal): Error {
  return signal.reason instanceof Error ? signal.reason : new Error('操作已取消')
}
