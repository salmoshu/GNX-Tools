<template>
  <section class="update-page">
    <div class="update-intro">
      <div>
        <h1>版本更新</h1>
        <p>通过 GitHub Releases 检查并安装最新版本</p>
      </div>
      <el-button
        type="primary"
        :loading="checking"
        :disabled="downloading"
        @click="$emit('check')"
      >
        检查更新
      </el-button>
    </div>

    <div class="update-body">
      <section class="update-section">
        <div class="version-row">
          <span>当前版本</span>
          <strong>V{{ version }}</strong>
        </div>
        <div class="status-line" :class="statusTone">{{ statusText }}</div>
        <el-progress
          v-if="percent !== null"
          class="update-progress"
          :percentage="percent"
          :stroke-width="10"
        />
        <div v-if="notes" class="release-notes">
          <div class="release-notes-title">更新内容</div>
          <pre>{{ notes }}</pre>
        </div>
        <div v-if="event?.type === 'update-downloaded'" class="update-actions">
          <el-button type="primary" @click="$emit('install')">重启并安装</el-button>
        </div>
        <div
          v-else-if="event?.type === 'update-available' && !prefs.autoDownload"
          class="update-actions"
        >
          <el-button @click="$emit('ignore')">忽略此版本</el-button>
          <el-button type="primary" @click="$emit('download')">立即下载</el-button>
        </div>
      </section>

      <section class="update-section">
        <div class="pref-row">
          <div class="pref-copy">
            <strong>自动检查更新</strong>
            <small>启动时检查 GitHub 上是否有新版本</small>
          </div>
          <el-switch
            :model-value="prefs.autoCheck"
            @update:model-value="updatePref('autoCheck', $event)"
          />
        </div>
        <div class="pref-row">
          <div class="pref-copy">
            <strong>自动下载更新</strong>
            <small>发现新版本后在后台下载，完成后提示安装</small>
          </div>
          <el-switch
            :model-value="prefs.autoDownload"
            @update:model-value="updatePref('autoDownload', $event)"
          />
        </div>
      </section>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { UpdateStatusEvent, UpdaterPrefs } from '../../shared/update'

const props = defineProps<{
  version: string
  event: UpdateStatusEvent | null
  prefs: UpdaterPrefs
}>()
const emit = defineEmits<{
  check: []
  download: []
  install: []
  ignore: []
  'set-prefs': [patch: Partial<UpdaterPrefs>]
}>()

function updatePref(key: 'autoCheck' | 'autoDownload', value: unknown): void {
  emit('set-prefs', { [key]: Boolean(value) })
}

const checking = computed(() => props.event?.type === 'checking')
const downloading = computed(() => props.event?.type === 'download-progress')

const percent = computed<number | null>(() => {
  if (props.event?.type === 'download-progress') {
    return Math.max(0, Math.min(100, props.event.percent ?? 0))
  }
  if (props.event?.type === 'update-downloaded') return 100
  return null
})

const notes = computed(() => props.event?.releaseNotes?.trim() ?? '')

const statusTone = computed(() => {
  switch (props.event?.type) {
    case 'update-not-available':
    case 'update-downloaded':
      return 'success'
    case 'update-available':
    case 'download-progress':
      return 'primary'
    case 'error':
      return 'error'
    default:
      return 'muted'
  }
})

const statusText = computed(() => {
  const event = props.event
  if (!event) return '尚未检查更新'
  switch (event.type) {
    case 'checking':
      return '正在检查更新…'
    case 'update-available':
      return `发现新版本 V${event.version ?? ''}${props.prefs.autoDownload ? '，正在后台下载' : ''}`
    case 'update-not-available':
      return '当前已是最新版本'
    case 'download-progress':
      return `正在下载 V${event.version ?? ''}`
    case 'update-downloaded':
      return `V${event.version ?? ''} 已下载，重启后完成安装`
    case 'error':
      return `检查更新失败：${event.message ?? '未知错误'}`
    default:
      return '尚未检查更新'
  }
})
</script>

<style scoped>
.update-page {
  display: flex;
  overflow: hidden;
  flex-direction: column;
  border: 1px solid var(--app-border);
  border-radius: var(--app-radius);
  background: var(--app-surface);
  box-shadow: var(--app-shadow);
}
.update-intro {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 14px 20px;
  border-bottom: 1px solid var(--app-border);
}
.update-intro h1 {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  line-height: 22px;
}
.update-intro p {
  margin: 4px 0 0;
  color: var(--app-text-muted);
  font-size: 12px;
}
.update-body {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 20px;
}
.update-section {
  padding: 16px;
  border: 1px solid var(--app-border);
  border-radius: 10px;
  background: var(--app-muted);
}
.version-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  color: var(--app-text-secondary);
  font-size: 13px;
}
.version-row strong {
  color: var(--app-text);
  font-size: 16px;
  font-weight: 600;
}
.status-line {
  margin-top: 10px;
  font-size: 13px;
  line-height: 20px;
}
.status-line.muted {
  color: var(--app-text-muted);
}
.status-line.primary {
  color: var(--el-color-primary);
}
.status-line.success {
  color: var(--el-color-success);
}
.status-line.error {
  color: var(--el-color-danger);
}
.update-progress {
  margin-top: 12px;
}
.release-notes {
  margin-top: 12px;
}
.release-notes-title {
  margin-bottom: 6px;
  font-size: 12px;
  font-weight: 600;
}
.release-notes pre {
  max-height: 160px;
  margin: 0;
  padding: 10px 12px;
  overflow: auto;
  border: 1px solid var(--app-border);
  border-radius: 8px;
  color: var(--app-text-secondary);
  background: var(--app-surface);
  font-family: inherit;
  font-size: 12px;
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-word;
}
.update-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 14px;
}
.update-actions .el-button + .el-button {
  margin-left: 0;
}
.pref-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
}
.pref-row + .pref-row {
  margin-top: 14px;
  padding-top: 14px;
  border-top: 1px solid var(--app-border);
}
.pref-copy {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 3px;
}
.pref-copy strong {
  font-size: 13px;
  font-weight: 600;
}
.pref-copy small {
  color: var(--app-text-muted);
  font-size: 11px;
}
</style>
