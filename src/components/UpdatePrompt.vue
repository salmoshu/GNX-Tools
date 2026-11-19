<template>
  <div class="update-prompt" role="status">
    <button type="button" class="update-prompt-close" title="稍后" @click="$emit('dismiss')">
      <el-icon><Close /></el-icon>
    </button>
    <div class="update-prompt-title">
      {{ downloaded ? '更新已就绪' : '发现新版本' }}
    </div>
    <p class="update-prompt-desc">
      <template v-if="downloaded">
        V{{ version }} 已下载完成，重启后自动安装。
      </template>
      <template v-else>
        V{{ version }} 可以更新，是否现在下载？
      </template>
    </p>
    <div class="update-prompt-actions">
      <el-button size="small" @click="$emit('dismiss')">稍后</el-button>
      <el-button v-if="downloaded" size="small" type="primary" @click="$emit('install')">
        重启并安装
      </el-button>
      <el-button v-else size="small" type="primary" @click="$emit('download')">
        立即下载
      </el-button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { Close } from '@element-plus/icons-vue'
import type { UpdateStatusEvent } from '../../shared/update'

const props = defineProps<{ event: UpdateStatusEvent }>()
defineEmits<{ download: []; install: []; dismiss: [] }>()

const version = computed(() => props.event.version ?? '')
const downloaded = computed(() => props.event.type === 'update-downloaded')
</script>

<style scoped>
.update-prompt {
  position: fixed;
  right: 16px;
  bottom: 56px;
  z-index: 9000;
  width: 300px;
  padding: 16px;
  border: 1px solid var(--app-border);
  border-radius: 12px;
  background: var(--app-surface);
  box-shadow: 0 12px 32px #00000024;
  animation: update-prompt-in 0.24s cubic-bezier(0.22, 0.61, 0.36, 1);
}
@keyframes update-prompt-in {
  from {
    opacity: 0;
    transform: translateX(calc(100% + 24px));
  }
  to {
    opacity: 1;
    transform: translateX(0);
  }
}
@media (prefers-reduced-motion: reduce) {
  .update-prompt {
    animation: none;
  }
}
.update-prompt-close {
  position: absolute;
  top: 8px;
  right: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  padding: 0;
  border: none;
  border-radius: 6px;
  color: var(--app-text-muted);
  background: transparent;
  cursor: pointer;
}
.update-prompt-close:hover {
  color: var(--app-text);
  background: var(--app-hover);
}
.update-prompt-title {
  padding-right: 24px;
  font-size: 14px;
  font-weight: 600;
}
.update-prompt-desc {
  margin: 8px 0 14px;
  color: var(--app-text-secondary);
  font-size: 13px;
  line-height: 1.6;
}
.update-prompt-actions {
  display: flex;
  gap: 8px;
}
.update-prompt-actions .el-button {
  flex: 1;
  margin-left: 0;
}
</style>
