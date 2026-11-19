<template>
  <el-dialog
    v-model="visible"
    width="min(540px, calc(100vw - 24px))"
    class="app-dialog connection-dialog"
    :close-on-click-modal="false"
    :append-to-body="true"
    :z-index="8000"
    align-center
  >
    <template #header>
      <div class="dialog-title"><strong>串口连接</strong></div>
    </template>

    <el-form label-position="top" class="connection-form">
      <el-form-item label="串口">
        <div class="port-selector">
          <el-select
            v-model="selected"
            :disabled="snapshot.busy || snapshot.connected"
            placeholder="请选择串口"
            filterable
            popper-class="connection-port-popper"
          >
            <el-option
              v-for="item in ports"
              :key="item.path"
              :label="item.friendlyName"
              :value="item.path"
            >
              <span class="port-option">
                <strong>{{ item.path }}</strong>
                <small>{{ item.friendlyName }}</small>
              </span>
            </el-option>
          </el-select>
          <el-button :disabled="snapshot.busy || snapshot.connected" title="刷新串口" @click="$emit('refresh')">
            <el-icon><Refresh /></el-icon>
          </el-button>
        </div>
      </el-form-item>
      <div class="rate-grid">
        <el-form-item label="Boot 波特率">
          <el-input-number
            v-model="rates.bootBaudRate"
            :min="1"
            :max="12000000"
            :disabled="snapshot.busy || snapshot.connected"
          />
        </el-form-item>
        <el-form-item label="Loader 波特率">
          <el-input-number
            v-model="rates.loaderBaudRate"
            :min="1"
            :max="12000000"
            :disabled="snapshot.busy || snapshot.connected"
          />
        </el-form-item>
      </div>
    </el-form>

    <template #footer>
      <el-button @click="visible = false">关闭</el-button>
      <el-button v-if="snapshot.connected" :disabled="snapshot.busy" @click="$emit('disconnect')">
        断开串口
      </el-button>
      <el-button v-else type="primary" :disabled="!selected || snapshot.busy" @click="connect">
        打开串口
      </el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { Refresh } from '@element-plus/icons-vue'
import type { FlashSnapshot, SerialPortInfo, SerialSettings } from '../../shared/flash'

const props = defineProps<{
  modelValue: boolean
  ports: SerialPortInfo[]
  port: string
  settings: SerialSettings
  snapshot: FlashSnapshot
}>()
const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  connect: [value: { port: string; settings: SerialSettings }]
  disconnect: []
  refresh: []
}>()
const visible = computed({
  get: () => props.modelValue,
  set: (value) => emit('update:modelValue', value),
})
const selected = ref(props.port)
const rates = reactive<SerialSettings>({ ...props.settings })

watch(
  () => props.modelValue,
  (open) => {
    if (!open) return
    selected.value = props.port
    Object.assign(rates, props.settings)
    emit('refresh')
  },
)
watch(
  () => props.port,
  (value) => {
    if (!selected.value) selected.value = value
  },
)

function connect(): void {
  emit('connect', { port: selected.value, settings: { ...rates } })
}
</script>

<style scoped>
.dialog-title strong {
  color: var(--app-text);
  font-size: 15px;
}
.port-selector {
  display: flex;
  width: 100%;
  gap: 8px;
}
.port-selector .el-select {
  flex: 1;
}
.port-option {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}
.port-option small {
  overflow: hidden;
  color: var(--app-text-muted);
  text-overflow: ellipsis;
}
.rate-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}
.rate-grid .el-input-number {
  width: 100%;
}

</style>
