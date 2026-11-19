<template>
  <header class="app-header" @dblclick="toggleMaximize">
    <div class="brand">
      <img :src="iconUrl" alt="" class="brand-logo" />
      <span class="brand-copy">
        <span class="brand-name">GNX Tools</span>
        <span class="brand-version">V1.0.0</span>
      </span>
    </div>
    <div class="header-controls" @dblclick.stop>
      <button class="header-button" type="button" title="最小化" @click="minimize">
        <el-icon><Minus /></el-icon>
      </button>
      <button
        class="header-button"
        type="button"
        :title="maximized ? '还原' : '最大化'"
        @click="toggleMaximize"
      >
        <el-icon><CopyDocument v-if="maximized" /><FullScreen v-else /></el-icon>
      </button>
      <button class="header-button close" type="button" title="关闭" @click="close">
        <el-icon><Close /></el-icon>
      </button>
    </div>
  </header>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import { ElMessageBox } from 'element-plus'
import { Close, CopyDocument, FullScreen, Minus } from '@element-plus/icons-vue'
import iconUrl from '../assets/icon.svg'

const props = defineProps<{ busy: boolean }>()
const maximized = ref(false)
let unsubscribe: (() => void) | undefined

onMounted(() => {
  unsubscribe = window.gnx.onWindowState((state) => (maximized.value = state.maximized))
})
onUnmounted(() => unsubscribe?.())

async function minimize(): Promise<void> {
  await window.gnx.minimizeWindow()
}

async function toggleMaximize(): Promise<void> {
  maximized.value = await window.gnx.toggleMaximizeWindow()
}

async function close(): Promise<void> {
  if (props.busy) {
    try {
      await ElMessageBox.confirm('当前操作尚未完成，关闭窗口将取消操作。是否继续？', '关闭 GNX Tools', {
        type: 'warning',
        confirmButtonText: '取消操作并关闭',
        cancelButtonText: '返回',
      })
    } catch {
      return
    }
    await window.gnx.cancel()
  }
  await window.gnx.closeWindow()
}
</script>

<style scoped>
.app-header {
  display: flex;
  flex: 0 0 38px;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  height: 38px;
  border-bottom: 1px solid var(--app-border);
  color: var(--app-text);
  background: var(--app-surface);
  user-select: none;
  -webkit-app-region: drag;
  position: relative;
  z-index: 100;
}
.brand {
  display: flex;
  align-self: stretch;
  align-items: center;
  min-width: 0;
  padding-left: 10px;
  gap: 7px;
}
.brand-logo {
  width: 22px;
  height: 22px;
  object-fit: contain;
}
.brand-copy {
  display: inline-flex;
  align-items: baseline;
  gap: 7px;
}
.brand-name {
  font-size: 14px;
  font-weight: 700;
  white-space: nowrap;
}
.brand-version {
  color: var(--app-text-muted);
  font-size: 10px;
}
.header-controls {
  display: flex;
  align-self: stretch;
  align-items: center;
  -webkit-app-region: no-drag;
}
.header-button {
  display: grid;
  place-items: center;
  width: 42px;
  height: 100%;
  padding: 0;
  border: 0;
  border-radius: 0;
  color: var(--app-text-secondary);
  background: transparent;
  outline: none;
  -webkit-app-region: no-drag;
}
.header-button:hover,
.header-button:focus-visible {
  color: var(--app-text);
  background: var(--app-hover);
}
.header-button.close:hover,
.header-button.close:focus-visible {
  color: #fff;
  background: #d92d3a;
}
@media (max-width: 600px) {
  .brand-version {
    display: none;
  }
}
</style>
