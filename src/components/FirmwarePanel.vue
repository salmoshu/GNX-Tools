<template>
  <section class="firmware-page">
    <div class="page-intro">
      <h1>{{ title }}</h1>
    </div>

    <div class="file-section">
      <label>固件文件</label>
      <div class="file-picker">
        <el-input :model-value="file?.path ?? ''" readonly placeholder="选择 .bin 固件文件" />
        <el-button :disabled="busy" @click="$emit('choose')">
          <el-icon><FolderOpened /></el-icon>选择文件
        </el-button>
      </div>
      <div class="file-details">
        <span>{{ file?.name || '尚未选择文件' }}</span>
        <span v-if="file?.size">{{ formatBytes(file.size) }} · {{ Math.ceil(file.size / 1024) }} 包</span>
      </div>
    </div>

    <div class="action-footer">
      <span v-if="kind === 'loader'" class="loader-hint">更新失败可能影响后续烧录，请确认固件来源。</span>
      <div v-if="kind === 'loader'" class="loader-actions">
        <el-button :disabled="!enabled || !file" @click="$emit('start', 'loader-backup')">
          Boot 备份更新（1）
        </el-button>
        <el-button :disabled="!enabled || !file" @click="$emit('start', 'loader-boot')">
          Boot 直接更新（4）
        </el-button>
        <el-button
          type="warning"
          :disabled="!enabled || !file"
          @click="$emit('start', 'loader-loader')"
        >
          Loader 自更新（6）
        </el-button>
      </div>
      <el-button
        v-else
        type="primary"
        :disabled="!enabled || !file"
        @click="$emit('start', kind)"
      >
        <el-icon><Download /></el-icon>开始烧录
      </el-button>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { Download, FolderOpened } from '@element-plus/icons-vue'
import type { FirmwareFile, FlashOperation } from '../../shared/flash'

const props = defineProps<{
  kind: 'host' | 'gnss' | 'loader'
  file: FirmwareFile | null
  busy: boolean
  enabled: boolean
}>()
defineEmits<{
  choose: []
  start: [operation: FlashOperation]
}>()

const title = computed(() => {
  if (props.kind === 'gnss') return 'GNSS 应用固件'
  if (props.kind === 'loader') return 'Loader 固件更新'
  return 'HOST 应用固件'
})

function formatBytes(value: number): string {
  if (value < 1024) return `${value} B`
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KiB`
  return `${(value / 1024 / 1024).toFixed(2)} MiB`
}
</script>

<style scoped>
.firmware-page {
  overflow: hidden;
  border: 1px solid var(--app-border);
  border-radius: var(--app-radius);
  background: var(--app-surface);
  box-shadow: var(--app-shadow);
}
.page-intro {
  padding: 14px 20px;
  border-bottom: 1px solid var(--app-border);
}
.page-intro h1 {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  line-height: 22px;
}
.file-section {
  padding: 20px;
}
.file-section > label {
  display: block;
  margin-bottom: 8px;
  color: var(--app-text-secondary);
  font-size: 13px;
  font-weight: 500;
}
.file-picker {
  display: flex;
  gap: 10px;
}
.file-picker .el-input {
  min-width: 0;
  flex: 1;
}
.file-details {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  margin-top: 8px;
  color: var(--app-text-muted);
  font-size: 12px;
}
.action-footer {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 16px;
  padding: 14px 20px;
  border-top: 1px solid var(--app-border);
}
.loader-hint {
  margin-right: auto;
  color: var(--app-text-muted);
  font-size: 12px;
}
.loader-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 8px;
}
.loader-actions .el-button {
  margin-left: 0;
}
@media (max-width: 900px) {
  .action-footer {
    align-items: flex-start;
    flex-direction: column;
  }
  .loader-hint {
    margin-right: 0;
  }
}
</style>
