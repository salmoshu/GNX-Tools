import { contextBridge, ipcRenderer } from 'electron'
import type {
  CommandRequest,
  EntryRequest,
  FlashEvent,
  FlashRequest,
  GnxApi,
} from '../../shared/flash'

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
