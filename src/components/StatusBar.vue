<template>
  <footer class="statusbar">
    <div class="connection-controls">
      <div class="toggle-switch-container">
        <button
          class="toggle-switch"
          :class="{
            'toggle-on': snapshot.connected,
            'toggle-pending': connecting,
            'toggle-disabled': snapshot.busy && !connecting,
          }"
          type="button"
          role="switch"
          :aria-checked="snapshot.connected"
          :aria-busy="connecting"
          :disabled="snapshot.busy"
          :title="toggleTitle"
          @click="$emit('toggle-connection')"
        >
          <span class="toggle-slider">
            <span class="slider-icon" v-html="toggleIcon"></span>
          </span>
        </button>
      </div>
      <button
        class="toolbar-btn"
        type="button"
        :disabled="snapshot.busy"
        title="串口配置（Input）"
        aria-label="串口配置"
        @click="$emit('configure')"
      >
        <svg viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
          <path d="M810.666667 128H213.333333c-46.933333 0-85.333333 38.4-85.333333 85.333333v597.333334c0 46.933333 38.4 85.333333 85.333333 85.333333h597.333334c46.933333 0 85.333333-38.4 85.333333-85.333333V213.333333c0-46.933333-38.4-85.333333-85.333333-85.333333z m0 640c0 23.466667-19.2 42.666667-42.666667 42.666667H256c-23.466667 0-42.666667-19.2-42.666667-42.666667V256c0-23.466667 19.2-42.666667 42.666667-42.666667h512c23.466667 0 42.666667 19.2 42.666667 42.666667v512z" fill="currentColor" />
          <path d="M682.666667 381.866667v-85.333334H341.333333v85.333334h128V640h-128v85.333333h341.333334v-85.333333h-128V381.866667z" fill="currentColor" />
        </svg>
      </button>
    </div>
    <span class="status-divider" aria-hidden="true"></span>
    <div class="connection-summary">
      <el-icon><Connection /></el-icon>
      <strong>{{ snapshot.connected ? snapshot.port : '串口未连接' }}</strong>
      <span>{{ snapshot.connected ? `${snapshot.baudRate} baud` : '点击 I 配置串口' }}</span>
    </div>
    <span class="status-item">{{ modeText }}</span>
    <span class="status-spacer"></span>
    <span class="status-message" :title="snapshot.message">{{ snapshot.message }}</span>
  </footer>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { Connection } from '@element-plus/icons-vue'
import type { FlashSnapshot } from '../../shared/flash'

const props = defineProps<{ snapshot: FlashSnapshot }>()
defineEmits<{ configure: []; 'toggle-connection': [] }>()

const icons = {
  connected:
    '<svg viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg"><path d="M512 85.333333C277.333333 85.333333 85.333333 277.333333 85.333333 512s192 426.666667 426.666667 426.666667 426.666667-192 426.666667-426.666667S746.666667 85.333333 512 85.333333z m-85.333333 648.533334l-213.333334-213.333334 59.733334-59.733333 153.6 153.6 324.266666-324.266667 59.733334 59.733334-384 384z" fill="#2dde98"/></svg>',
  disconnected:
    '<svg viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg"><path d="M512 85.333333C277.333333 85.333333 85.333333 277.333333 85.333333 512s192 426.666667 426.666667 426.666667 426.666667-192 426.666667-426.666667S746.666667 85.333333 512 85.333333z m243.2 610.133334l-59.733333 59.733333-183.466667-183.466667-183.466667 183.466667-59.733333-59.733333 183.466667-183.466667-183.466667-183.466667 59.733333-59.733333 183.466667 183.466667 183.466667-183.466667 59.733333 59.733333-183.466667 183.466667 183.466667 183.466667z" fill="#FF8680"/></svg>',
  connecting:
    '<svg viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg"><path fill-rule="evenodd" d="M512 85.333333C277.333333 85.333333 85.333333 277.333333 85.333333 512s192 426.666667 426.666667 426.666667 426.666667-192 426.666667-426.666667S746.666667 85.333333 512 85.333333z M297 212H727V337L594 477V547L727 687V812H297V687L430 547V477L297 337Z" fill="#FFA940"/></svg>',
}

const connecting = computed(() => props.snapshot.phase === 'connecting')
const toggleIcon = computed(() =>
  connecting.value
    ? icons.connecting
    : props.snapshot.connected
      ? icons.connected
      : icons.disconnected,
)
const toggleTitle = computed(() => {
  if (connecting.value) return '正在打开串口'
  if (props.snapshot.busy) return '当前操作期间不可切换串口'
  return props.snapshot.connected ? '关闭串口' : '打开串口'
})
const modeText = computed(() => {
  return props.snapshot.mode === 'boot'
    ? 'Boot'
    : props.snapshot.mode === 'loader'
      ? 'Loader'
      : '未知模式'
})
</script>

<style scoped>
.statusbar {
  display: flex;
  flex: 0 0 40px;
  align-items: center;
  gap: 12px;
  min-width: 0;
  height: 40px;
  padding: 0 16px 0 8px;
  border-top: 1px solid var(--app-border);
  color: var(--app-text-secondary);
  background: var(--app-surface);
  font-size: 12px;
  user-select: none;
}
.connection-controls {
  display: flex;
  flex: none;
  align-items: center;
  gap: 4px;
}
.toggle-switch-container {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 2px;
}
.toggle-switch {
  position: relative;
  display: inline-flex;
  align-items: center;
  width: 44px;
  height: 24px;
  padding: 2px;
  border: 1px solid var(--app-border);
  border-radius: 12px;
  background: var(--app-muted);
  cursor: pointer;
  transition: background-color 0.3s;
}
.toggle-switch.toggle-disabled {
  cursor: not-allowed;
  opacity: 0.55;
}
.toggle-slider {
  position: absolute;
  top: 50%;
  left: 3px;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  transform: translateY(-50%);
  transition: transform 0.3s;
}
.toggle-switch.toggle-on .toggle-slider,
.toggle-switch.toggle-pending .toggle-slider {
  transform: translate(18px, -50%);
}
.toggle-switch.toggle-pending .slider-icon {
  animation: toggle-pending-pulse 1s ease-in-out infinite;
}
.slider-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  line-height: 0;
}
.slider-icon :deep(svg) {
  display: block;
  width: 18px;
  height: 18px;
}
.toolbar-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  padding: 5px;
  overflow: hidden;
  border: 0;
  border-radius: 4px;
  color: var(--app-text-secondary);
  background: transparent;
  cursor: pointer;
  transition:
    color 140ms ease,
    background-color 140ms ease;
}
.toolbar-btn svg {
  display: block;
  width: 18px;
  height: 18px;
}
.toolbar-btn:hover:not(:disabled) {
  color: var(--app-text);
  background: var(--app-hover);
}
.toolbar-btn:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}
.status-divider {
  width: 1px;
  height: 20px;
  flex: none;
  background: var(--app-border);
}
.connection-summary {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  white-space: nowrap;
}
.connection-summary > .el-icon {
  flex: none;
}
.connection-summary strong {
  color: var(--app-text);
  font-weight: 600;
}
.connection-summary span {
  color: var(--app-text-muted);
}
.status-item {
  white-space: nowrap;
}
.status-spacer {
  flex: 1;
}
.status-message {
  min-width: 0;
  overflow: hidden;
  color: var(--app-text-muted);
  text-overflow: ellipsis;
  white-space: nowrap;
}
@keyframes toggle-pending-pulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.35;
  }
}
@media (max-width: 900px) {
  .connection-summary span {
    display: none;
  }
}
@media (max-width: 760px) {
  .status-message {
    display: none;
  }
}
</style>
