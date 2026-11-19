import { contextBridge, ipcRenderer } from 'electron'
import type {
  CommandRequest,
  EntryRequest,
  FlashEvent,
  FlashRequest,
  GnxApi,
} from '../../shared/flash'
import type { UpdateStatusEvent, UpdaterApi, UpdaterPrefs } from '../../shared/update'

const api: GnxApi = {
  listPorts: () => ipcRenderer.invoke('ports:list'),
  chooseFile: () => ipcRenderer.invoke('dialog:choose-file'),
  getSnapshot: () => ipcRenderer.invoke('operation:snapshot'),
  open: (port, loaderBaudRate) => ipcRenderer.invoke('serial:open', port, loaderBaudRate),
  close: () => ipcRenderer.invoke('serial:close'),
  enter: (request: EntryRequest) => ipcRenderer.invoke('device:enter', request),
  flash: (request: FlashRequest) => ipcRenderer.invoke('firmware:flash', request),
  cancel: () => ipcRenderer.invoke('operation:cancel'),
  command: (request: CommandRequest) => ipcRenderer.invoke('device:command', request),
  onEvent: (listener: (event: FlashEvent) => void) => {
    const wrapped = (_event: Electron.IpcRendererEvent, value: FlashEvent) => listener(value)
    ipcRenderer.on('flash-event', wrapped)
    return () => ipcRenderer.off('flash-event', wrapped)
  },
  minimizeWindow: () => ipcRenderer.invoke('window:minimize'),
  toggleMaximizeWindow: () => ipcRenderer.invoke('window:toggle-maximize'),
  closeWindow: () => ipcRenderer.invoke('window:close'),
  onWindowState: (listener) => {
    const wrapped = (_event: Electron.IpcRendererEvent, state: { maximized: boolean }) =>
      listener(state)
    ipcRenderer.on('window:state', wrapped)
    return () => ipcRenderer.off('window:state', wrapped)
  },
}

contextBridge.exposeInMainWorld('gnx', api)

const updater: UpdaterApi = {
  getVersion: () => ipcRenderer.invoke('app:version'),
  checkForUpdates: () => ipcRenderer.invoke('update:check'),
  downloadUpdate: () => ipcRenderer.invoke('update:download'),
  quitAndInstall: () => ipcRenderer.invoke('update:install'),
  setPrefs: (prefs: UpdaterPrefs) => ipcRenderer.send('update:prefs', prefs),
  onStatus: (listener: (event: UpdateStatusEvent) => void) => {
    const wrapped = (_event: Electron.IpcRendererEvent, value: UpdateStatusEvent) => listener(value)
    ipcRenderer.on('update:status', wrapped)
    return () => ipcRenderer.off('update:status', wrapped)
  },
}

contextBridge.exposeInMainWorld('updater', updater)
