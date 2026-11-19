import { app } from 'electron'
import { appendFileSync, statSync, truncateSync } from 'node:fs'
import { join } from 'node:path'
// electron-updater 是 CJS 包，ESM 主进程产物下需走默认导入再解构
import updaterPkg from 'electron-updater'
import type { UpdateStatusEvent, UpdaterPrefs } from '../../shared/update'

const { autoUpdater } = updaterPkg

export const UPDATE_STATUS_CHANNEL = 'update:status'

const DEFAULT_PREFS: UpdaterPrefs = { autoCheck: true, autoDownload: true }

export interface UpdateStatusTarget {
  isDestroyed(): boolean
  send(channel: string, payload: unknown): void
}

function createUpdaterFileLogger(): {
  info(message: unknown): void
  warn(message: unknown): void
  error(message: unknown): void
  debug(message: unknown): void
} {
  const file = join(app.getPath('userData'), 'updater.log')
  const write = (level: string, message: unknown) => {
    try {
      const text = message instanceof Error ? (message.stack ?? message.message) : String(message)
      appendFileSync(file, `[${new Date().toISOString()}] [${level}] ${text}\n`)
      if (statSync(file).size > 1024 * 1024) truncateSync(file)
    } catch {
      // 日志写入失败不影响更新流程
    }
  }
  return {
    info: (message) => write('info', message),
    warn: (message) => write('warn', message),
    error: (message) => write('error', message),
    debug: (message) => write('debug', message),
  }
}

/** GitHub Atom 源回退时 releaseNotes 是 HTML，降级为纯文本 */
function cleanReleaseNotes(raw: unknown): string | undefined {
  if (typeof raw !== 'string' || !raw.trim()) return undefined
  if (!raw.includes('\n') && /<\/?[a-z][\s\S]*>/i.test(raw)) {
    return raw
      .replace(/<[^>]+>/g, ' ')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/\s+/g, ' ')
      .trim()
  }
  return raw.trim()
}

/** latest.yml 注入的是整份更新日志，只取当前版本小节 */
function extractReleaseNotesSection(markdown: string, version: string): string | null {
  const escaped = version.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const start = markdown.search(new RegExp('^##\\s+v?' + escaped + '\\s*$', 'm'))
  if (start === -1) return null
  const rest = markdown.slice(start)
  const next = rest.slice(1).search(/^##\s+v/m)
  return (next === -1 ? rest : rest.slice(0, next + 1)).trim()
}

export class UpdateService {
  private target: UpdateStatusTarget | null = null
  private prefs: UpdaterPrefs = { ...DEFAULT_PREFS }
  private wired = false
  private prefsReceived = false
  private autoCheckDone = false

  attach(target: UpdateStatusTarget): void {
    this.target = target
    this.wireEvents()
  }

  applyPrefs(raw: unknown): void {
    this.prefs = normalizePrefs(raw)
    autoUpdater.autoDownload = this.prefs.autoDownload
    autoUpdater.autoInstallOnAppQuit = true
    this.prefsReceived = true
    this.maybeAutoCheck()
  }

  async checkForUpdates(): Promise<void> {
    if (!app.isPackaged) {
      throw new Error('当前为开发环境，检查更新需在打包版本中运行')
    }
    await autoUpdater.checkForUpdates()
  }

  async downloadUpdate(): Promise<void> {
    if (!app.isPackaged) {
      throw new Error('当前为开发环境，更新需在打包版本中运行')
    }
    await autoUpdater.downloadUpdate()
  }

  quitAndInstall(): void {
    // 静默安装并在完成后自动启动新版本
    autoUpdater.quitAndInstall(true, true)
  }

  private wireEvents(): void {
    if (this.wired) return
    this.wired = true

    autoUpdater.on('checking-for-update', () => this.send({ type: 'checking' }))
    autoUpdater.on('update-available', (info) => {
      const notes = cleanReleaseNotes(info.releaseNotes)
      this.send({
        type: 'update-available',
        version: info.version,
        releaseNotes: notes
          ? (extractReleaseNotesSection(notes, info.version) ?? notes)
          : undefined,
      })
    })
    autoUpdater.on('update-not-available', () => this.send({ type: 'update-not-available' }))
    autoUpdater.on('download-progress', (progress) =>
      this.send({ type: 'download-progress', percent: Math.floor(progress.percent) }),
    )
    autoUpdater.on('update-downloaded', (info) =>
      this.send({ type: 'update-downloaded', version: info.version }),
    )
    autoUpdater.on('error', (error) =>
      this.send({ type: 'error', message: error?.message ?? String(error) }),
    )

    autoUpdater.autoDownload = this.prefs.autoDownload
    autoUpdater.autoInstallOnAppQuit = true
    // 差量更新校验失败会静默回退全量，进度条出现 100%→0→100% 的假象；
    // 全部走全量下载，进度单调且经 sha512 校验
    autoUpdater.disableDifferentialDownload = true
    autoUpdater.logger = createUpdaterFileLogger()
    this.maybeAutoCheck()
  }

  private maybeAutoCheck(): void {
    if (this.autoCheckDone || !this.prefsReceived) return
    this.autoCheckDone = true
    if (app.isPackaged && this.prefs.autoCheck) {
      autoUpdater.checkForUpdates().catch(() => {})
    }
  }

  private send(payload: UpdateStatusEvent): void {
    if (this.target && !this.target.isDestroyed()) {
      this.target.send(UPDATE_STATUS_CHANNEL, payload)
    }
  }
}

function normalizePrefs(raw: unknown): UpdaterPrefs {
  const value = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  const ignored = value.ignoredVersion
  return {
    autoCheck: value.autoCheck !== false,
    autoDownload: value.autoDownload !== false,
    ignoredVersion: typeof ignored === 'string' && ignored ? ignored : undefined,
  }
}
