<template>
  <div class="app-shell">
    <AppHeader :busy="snapshot.busy" />

    <div class="body-layout">
      <aside class="sidebar">
        <nav class="sidebar-nav">
          <button
            v-for="item in navigation"
            :key="item.id"
            type="button"
            class="nav-item"
            :class="{ active: activePage === item.id }"
            @click="activePage = item.id"
          >
            <span class="nav-icon"><el-icon><component :is="item.icon" /></el-icon></span>
            <strong>{{ item.label }}</strong>
          </button>
        </nav>
      </aside>

      <main class="workspace">
        <FirmwarePanel
          v-if="activePage !== 'control'"
          :kind="activePage"
          :file="files[activePage]"
          :busy="snapshot.busy"
          :enabled="canOperate"
          @choose="chooseFileForPage"
          @start="startFlash"
        />

        <section v-else class="control-page">
          <div class="control-intro"><h1>设备控制</h1></div>
          <div class="control-grid">
            <section class="control-section">
              <div class="section-title">启动模式</div>
              <div class="mode-cards">
                <button class="mode-card" :disabled="!canOperate" @click="enterMode('boot')">
                  <strong>Boot</strong>
                  <small>底层菜单</small>
                </button>
                <button class="mode-card" :disabled="!canOperate" @click="enterMode('loader')">
                  <strong>Loader</strong>
                  <small>烧录菜单</small>
                </button>
              </div>
            </section>

            <section class="control-section">
              <div class="section-title">常用命令</div>
              <div class="command-buttons">
                <el-button class="command-button" :disabled="!canOperate" @click="sendCommand('0')">
                  读取 Flash ID
                </el-button>
                <el-button class="command-button" :disabled="!canOperate" @click="sendCommand('b')">
                  运行 HOST
                </el-button>
                <el-button class="command-button" :disabled="!canOperate" @click="sendCommand('5')">
                  软件复位
                </el-button>
              </div>
            </section>

            <section class="control-section custom-section">
              <div class="section-title">自定义命令</div>
              <div class="custom-command">
                <el-input
                  v-model="customCommand"
                  :disabled="!canOperate"
                  maxlength="16"
                  placeholder="例如：3"
                  @keyup.enter="sendCustomCommand"
                />
                <el-button type="primary" :disabled="!canOperate || !customCommand" @click="sendCustomCommand">
                  发送
                </el-button>
              </div>
            </section>
          </div>
        </section>

        <el-card v-if="showProgress" shadow="never" class="progress-card">
          <div class="progress-heading">
            <div class="progress-title">{{ snapshot.message }}</div>
            <el-button v-if="snapshot.busy" type="danger" plain @click="cancelOperation">
              取消操作
            </el-button>
          </div>
          <el-progress
            :percentage="snapshot.progress"
            :status="progressStatus"
            :stroke-width="12"
            :show-text="snapshot.fileSize > 0"
          />
          <div v-if="snapshot.fileSize > 0" class="progress-stats">
            <span>{{ formatBytes(snapshot.transferredBytes) }} / {{ formatBytes(snapshot.fileSize) }}</span>
            <span>第 {{ snapshot.packet }} / {{ snapshot.totalPackets }} 包</span>
            <span v-if="snapshot.retries > 0">重试 {{ snapshot.retries }}</span>
          </div>
        </el-card>

        <el-card shadow="never" class="log-card">
          <template #header>
            <div class="log-heading">
              <div class="log-title"><span>运行日志</span></div>
              <div class="log-actions">
                <el-button text size="small" @click="toggleLogs">
                  <el-icon><ArrowDown v-if="logsCollapsed" /><ArrowUp v-else /></el-icon>
                  {{ logsCollapsed ? '展开' : '收起' }}
                </el-button>
                <el-button text size="small" :disabled="logs.length === 0" @click="logs = []">
                  <el-icon><Delete /></el-icon>清空
                </el-button>
              </div>
            </div>
          </template>
          <div v-show="!logsCollapsed" ref="logElement" class="log-terminal">
            <div v-if="logs.length === 0" class="empty-log">等待串口操作…</div>
            <div v-for="(entry, index) in logs" :key="index" class="log-line" :class="entry.level">
              <span class="log-time">{{ formatTime(entry.timestamp) }}</span>
              <span class="log-message">{{ entry.message }}</span>
            </div>
          </div>
        </el-card>
      </main>
    </div>

    <StatusBar
      :snapshot="snapshot"
      @configure="connectionVisible = true"
      @toggle-connection="toggleSerialConnection"
    />
    <ConnectionDialog
      v-model="connectionVisible"
      :ports="ports"
      :port="selectedPort"
      :settings="settings"
      :snapshot="snapshot"
      @connect="connectSerial"
      @disconnect="disconnectSerial"
      @refresh="refreshPorts"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, reactive, ref } from 'vue'
import { ElMessageBox } from 'element-plus'
import {
  ArrowDown,
  ArrowUp,
  Compass,
  Delete,
  Download,
  Operation,
  Upload,
} from '@element-plus/icons-vue'
import AppHeader from './components/AppHeader.vue'
import ConnectionDialog from './components/ConnectionDialog.vue'
import FirmwarePanel from './components/FirmwarePanel.vue'
import StatusBar from './components/StatusBar.vue'
import { notify } from './utils/notify'
import {
  BOOT_BAUD_RATE,
  EMPTY_FLASH_SNAPSHOT,
  LOADER_BAUD_RATE,
  type EntryMode,
  type FirmwareFile,
  type FlashOperation,
  type FlashSnapshot,
  type LogEntry,
  type SerialPortInfo,
  type SerialSettings,
} from '../shared/flash'

type PageId = 'host' | 'gnss' | 'loader' | 'control'

const navigation = [
  { id: 'host' as const, label: 'HOST 固件', icon: Download },
  { id: 'gnss' as const, label: 'GNSS 固件', icon: Compass },
  { id: 'loader' as const, label: 'Loader 更新', icon: Upload },
  { id: 'control' as const, label: '设备控制', icon: Operation },
]
const activePage = ref<PageId>('host')
const ports = ref<SerialPortInfo[]>([])
const selectedPort = ref(localStorage.getItem('gnx-port') ?? '')
const settings = reactive<SerialSettings>({
  bootBaudRate: Number(localStorage.getItem('gnx-boot-baud')) || BOOT_BAUD_RATE,
  loaderBaudRate: Number(localStorage.getItem('gnx-loader-baud')) || LOADER_BAUD_RATE,
})
const files = reactive<Record<'host' | 'gnss' | 'loader', FirmwareFile | null>>({
  host: restoreFile('host'),
  gnss: restoreFile('gnss'),
  loader: restoreFile('loader'),
})
const snapshot = ref<FlashSnapshot>({ ...EMPTY_FLASH_SNAPSHOT })
const logs = ref<LogEntry[]>([])
const logsCollapsed = ref(false)
const logElement = ref<HTMLElement | null>(null)
const customCommand = ref('')
const connectionVisible = ref(false)
let unsubscribe: (() => void) | undefined

const canOperate = computed(() => Boolean(selectedPort.value) && !snapshot.value.busy)
const progressStatus = computed(() => {
  if (snapshot.value.phase === 'success') return 'success'
  if (snapshot.value.phase === 'error' || snapshot.value.phase === 'cancelled') return 'exception'
  return undefined
})
const showProgress = computed(
  () => snapshot.value.busy || ['success', 'error', 'cancelled'].includes(snapshot.value.phase),
)

onMounted(async () => {
  if (!window.gnx) {
    notify('error', '运行环境错误', '请在 Electron 桌面应用中运行本工具')
    return
  }
  unsubscribe = window.gnx.onEvent((event) => {
    if (event.type === 'log') {
      logs.value.push(event.entry)
      if (logs.value.length > 1500) logs.value.splice(0, logs.value.length - 1500)
      void nextTick(() => {
        if (logElement.value) logElement.value.scrollTop = logElement.value.scrollHeight
      })
      return
    }
    const previous = snapshot.value.phase
    snapshot.value = event.snapshot
    notifyPhase(previous, event.snapshot)
  })
  snapshot.value = await window.gnx.getSnapshot()
  await refreshPorts()
})

onUnmounted(() => unsubscribe?.())

async function refreshPorts(): Promise<void> {
  try {
    ports.value = await window.gnx.listPorts()
    if (selectedPort.value && ports.value.some((port) => port.path === selectedPort.value)) return
    const preferred = ports.value.find((port) =>
      /CH34|USB|SERIAL/i.test(`${port.friendlyName} ${port.manufacturer ?? ''}`),
    )
    selectedPort.value = preferred?.path ?? ports.value[0]?.path ?? ''
  } catch (error) {
    showError(error)
  }
}

async function connectSerial(request: { port: string; settings: SerialSettings }): Promise<void> {
  try {
    selectedPort.value = request.port
    Object.assign(settings, request.settings)
    persistSettings()
    snapshot.value = await window.gnx.open(request.port, request.settings.loaderBaudRate)
    connectionVisible.value = false
  } catch (error) {
    showError(error)
  }
}

async function disconnectSerial(): Promise<void> {
  try {
    snapshot.value = await window.gnx.close()
  } catch (error) {
    showError(error)
  }
}

async function toggleSerialConnection(): Promise<void> {
  if (snapshot.value.busy) return
  if (snapshot.value.connected) {
    await disconnectSerial()
    return
  }
  if (!selectedPort.value) {
    connectionVisible.value = true
    return
  }
  await connectSerial({ port: selectedPort.value, settings: { ...settings } })
}

async function enterMode(mode: EntryMode): Promise<void> {
  try {
    persistSettings()
    await window.gnx.enter({ port: selectedPort.value, mode, settings: { ...settings } })
  } catch (error) {
    showError(error)
  }
}

async function chooseFileForPage(): Promise<void> {
  if (activePage.value === 'control') return
  await chooseFile(activePage.value)
}

async function chooseFile(kind: 'host' | 'gnss' | 'loader'): Promise<void> {
  try {
    const file = await window.gnx.chooseFile()
    if (!file) return
    files[kind] = file
    localStorage.setItem(`gnx-file-${kind}`, file.path)
  } catch (error) {
    showError(error)
  }
}

async function startFlash(operation: FlashOperation): Promise<void> {
  const file = operation === 'host' || operation === 'gnss' ? files[operation] : files.loader
  if (!file) return
  const names: Record<FlashOperation, string> = {
    host: 'HOST 固件',
    gnss: 'GNSS 固件',
    'loader-boot': 'Loader（Boot 直接更新）',
    'loader-loader': 'Loader（Loader 自更新）',
    'loader-backup': 'Loader（Boot 备份更新）',
  }
  try {
    await ElMessageBox.confirm(
      `即将向 ${selectedPort.value} 写入${names[operation]}。\n文件：${file.path}\n请确认固件与设备型号匹配。`,
      '确认烧录',
      {
        type: 'warning',
        confirmButtonText: '开始烧录',
        cancelButtonText: '取消',
        customClass: 'flash-confirm',
      },
    )
    persistSettings()
    await window.gnx.flash({
      port: selectedPort.value,
      operation,
      filePath: file.path,
      settings: { ...settings },
    })
  } catch (error) {
    if (error !== 'cancel' && error !== 'close') showError(error)
  }
}

async function cancelOperation(): Promise<void> {
  try {
    await window.gnx.cancel()
  } catch (error) {
    showError(error)
  }
}

async function sendCommand(command: string): Promise<void> {
  if (command === '5') {
    try {
      await ElMessageBox.confirm('软件复位将中断当前设备运行状态，是否继续？', '确认复位', {
        type: 'warning',
      })
    } catch {
      return
    }
  }
  try {
    await window.gnx.command({ port: selectedPort.value, command })
  } catch (error) {
    showError(error)
  }
}

function sendCustomCommand(): void {
  if (!customCommand.value) return
  void sendCommand(customCommand.value)
  customCommand.value = ''
}

function persistSettings(): void {
  localStorage.setItem('gnx-port', selectedPort.value)
  localStorage.setItem('gnx-boot-baud', String(settings.bootBaudRate))
  localStorage.setItem('gnx-loader-baud', String(settings.loaderBaudRate))
}

function restoreFile(kind: string): FirmwareFile | null {
  const path = localStorage.getItem(`gnx-file-${kind}`)
  if (!path) return null
  return { path, name: path.split(/[\\/]/).pop() ?? path, size: 0 }
}

function toggleLogs(): void {
  logsCollapsed.value = !logsCollapsed.value
  if (!logsCollapsed.value) {
    void nextTick(() => {
      if (logElement.value) logElement.value.scrollTop = logElement.value.scrollHeight
    })
  }
}

function formatBytes(value: number): string {
  if (value < 1024) return `${value} B`
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KiB`
  return `${(value / 1024 / 1024).toFixed(2)} MiB`
}

function formatTime(value: number): string {
  return new Date(value).toLocaleTimeString('zh-CN', { hour12: false })
}

function notifyPhase(previous: FlashSnapshot['phase'], current: FlashSnapshot): void {
  if (previous === current.phase) return
  if (current.phase === 'waiting-reset') {
    notify('warning', '需要复位开发板', current.message, 8000)
    return
  }
  if (current.phase === 'transferring') {
    notify(
      'info',
      '开始建立固件传输',
      '正在等待设备进入接收状态，传输期间请勿断电或关闭串口。',
      5000,
    )
    return
  }
  if (current.phase === 'success') {
    notify('success', '烧录完成', current.message, 6000)
    return
  }
  if (current.phase === 'error') {
    notify('error', '操作未完成', current.message, 10000)
    return
  }
  if (current.phase === 'cancelled') {
    notify('warning', '操作已取消', current.message, 5000)
  }
}

function showError(error: unknown): void {
  const message = error instanceof Error ? error.message : String(error)
  notify(
    'error',
    '操作失败',
    message.replace(/^Error invoking remote method '[^']+': (?:Error: )?/, ''),
    10000,
  )
}
</script>

<style scoped>
.app-shell {
  display: flex;
  height: 100vh;
  min-height: 600px;
  flex-direction: column;
  background: var(--app-bg);
}
.body-layout {
  display: grid;
  flex: 1;
  min-height: 0;
  grid-template-columns: 200px minmax(0, 1fr);
}
.sidebar {
  display: flex;
  min-height: 0;
  flex-direction: column;
  padding: 16px 12px;
  border-right: 1px solid var(--app-border);
  background: var(--app-surface);
}
.sidebar-nav {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.nav-item {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  padding: 10px 12px;
  border: 0;
  border-radius: 10px;
  color: var(--app-text-secondary);
  background: transparent;
  text-align: left;
  cursor: pointer;
}
.nav-item:hover {
  background: var(--app-hover);
}
.nav-item.active {
  color: var(--el-color-primary);
  background: var(--el-color-primary-light-9);
}
.nav-icon {
  display: grid;
  flex: none;
  place-items: center;
  width: 30px;
  height: 30px;
  border-radius: 8px;
  background: var(--app-muted);
}
.nav-item.active .nav-icon {
  background: var(--app-surface);
}
.nav-item strong {
  font-size: 13px;
  font-weight: 500;
}
.workspace {
  display: flex;
  min-width: 0;
  min-height: 0;
  flex-direction: column;
  gap: 16px;
  overflow: auto;
  padding: 18px 20px 20px;
}
.workspace > * {
  flex: none;
}
.control-page {
  overflow: hidden;
  border: 1px solid var(--app-border);
  border-radius: var(--app-radius);
  background: var(--app-surface);
  box-shadow: var(--app-shadow);
}
.control-intro {
  padding: 14px 20px;
  border-bottom: 1px solid var(--app-border);
}
.control-intro h1 {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  line-height: 22px;
}
.control-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 14px;
  padding: 20px;
}
.control-section {
  padding: 16px;
  border: 1px solid var(--app-border);
  border-radius: 10px;
  background: var(--app-muted);
}
.section-title {
  margin-bottom: 12px;
  font-size: 13px;
  font-weight: 600;
}
.mode-cards {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}
.mode-card {
  display: flex;
  min-width: 0;
  height: 64px;
  flex-direction: column;
  align-items: flex-start;
  justify-content: center;
  padding: 8px 14px;
  border: 1px solid var(--app-border);
  border-radius: 10px;
  color: var(--app-text);
  background: var(--app-surface);
  cursor: pointer;
}
.mode-card:hover:not(:disabled) {
  border-color: var(--el-color-primary);
  color: var(--el-color-primary);
}
.mode-card:disabled {
  cursor: default;
  opacity: 0.55;
}
.mode-card strong {
  font-size: 15px;
  font-weight: 600;
}
.mode-card small {
  margin-top: 4px;
  color: var(--app-text-muted);
  font-size: 11px;
}
.command-buttons {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
}
.command-button {
  width: 100%;
  height: 64px;
  margin-left: 0;
  padding: 0 8px;
}
.custom-section {
  grid-column: 1 / -1;
}
.custom-command {
  display: flex;
  gap: 8px;
}
.custom-command .el-input {
  min-width: 0;
  flex: 1;
}
.progress-heading,
.log-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.progress-title {
  font-size: 13px;
  font-weight: 500;
}
.progress-card :deep(.el-card__body) {
  padding: 14px 18px;
}
.log-title {
  font-size: 13px;
  font-weight: 600;
}
.log-card :deep(.el-card__header) {
  padding: 10px 16px;
}
.log-actions {
  display: flex;
  align-items: center;
  gap: 2px;
}
.log-actions .el-button {
  margin-left: 0;
}
.progress-stats {
  display: flex;
  flex-wrap: wrap;
  gap: 18px;
  margin-top: 10px;
  color: var(--app-text-muted);
  font-size: 12px;
}
.log-card :deep(.el-card__body) {
  padding: 0;
}
.log-terminal {
  height: 230px;
  overflow: auto;
  padding: 12px 16px;
  color: #d8dee9;
  background: #0d1b2e;
  font: 12px/1.65 Consolas, "Cascadia Mono", monospace;
  border-radius: 0 0 var(--app-radius) var(--app-radius);
}
.log-line {
  display: flex;
  gap: 10px;
}
.log-time {
  flex: none;
  color: #7c8da6;
}
.log-message {
  white-space: pre-wrap;
  word-break: break-word;
}
.log-line.success .log-message {
  color: #65d68a;
}
.log-line.warning .log-message {
  color: #ffd230;
}
.log-line.error .log-message {
  color: #ff7b86;
}
.log-line.tx .log-message {
  color: #72b5ff;
}
.empty-log {
  color: #7c8da6;
}
@media (max-width: 1000px) {
  .body-layout {
    grid-template-columns: 180px minmax(0, 1fr);
  }
  .control-grid {
    grid-template-columns: 1fr;
  }
  .custom-section {
    grid-column: auto;
  }
}
@media (max-width: 720px) {
  .body-layout {
    grid-template-columns: 68px minmax(0, 1fr);
  }
  .sidebar {
    padding-inline: 8px;
  }
  .nav-item strong {
    display: none;
  }
  .nav-item {
    justify-content: center;
    padding: 8px;
  }
}
</style>
<style>
.flash-confirm .el-message-box__content {
  white-space: pre-line;
}
</style>
