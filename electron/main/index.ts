import { app, BrowserWindow, dialog, ipcMain, type OpenDialogOptions } from 'electron'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type {
  CommandRequest,
  EntryRequest,
  FlashRequest,
  FirmwareFile,
} from '../../shared/flash'
import { FlashService } from './FlashService'

app.setName('GNX Tools')
if (process.platform === 'win32') app.setAppUserModelId('com.gnx.flashtool')

const __dirname = path.dirname(fileURLToPath(import.meta.url))
process.env.APP_ROOT = path.join(__dirname, '../..')

const flashService = new FlashService((event) => {
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) window.webContents.send('flash-event', event)
  }
})

function createWindow(): void {
  const rendererDist = path.join(process.env.APP_ROOT!, 'dist')
  const devServerUrl = process.env.VITE_DEV_SERVER_URL
  const publicDir = devServerUrl ? path.join(process.env.APP_ROOT!, 'public') : rendererDist
  const window = new BrowserWindow({
    width: 1100,
    height: 720,
    minWidth: 920,
    minHeight: 620,
    show: false,
    frame: false,
    autoHideMenuBar: true,
    backgroundColor: '#f9fbfc',
    icon: path.join(publicDir, 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })
  window.once('ready-to-show', () => window.show())
  const sendWindowState = () => {
    if (!window.isDestroyed()) {
      window.webContents.send('window:state', { maximized: window.isMaximized() })
    }
  }
  window.on('maximize', sendWindowState)
  window.on('unmaximize', sendWindowState)
  if (devServerUrl) {
    void window.loadURL(devServerUrl)
  } else {
    void window.loadFile(path.join(rendererDist, 'index.html'))
  }
}

ipcMain.handle('ports:list', () => flashService.listPorts())
ipcMain.handle('operation:snapshot', () => flashService.getSnapshot())
ipcMain.handle('serial:open', (_event, port: string, loaderBaudRate?: number) =>
  flashService.open(port, loaderBaudRate),
)
ipcMain.handle('serial:close', () => flashService.close())
ipcMain.handle('device:enter', (_event, request: EntryRequest) => flashService.enter(request))
ipcMain.handle('device:command', (_event, request: CommandRequest) => flashService.command(request))
ipcMain.handle('firmware:flash', (_event, request: FlashRequest) => flashService.flash(request))
ipcMain.handle('operation:cancel', () => flashService.cancel())
ipcMain.handle('window:minimize', (event) => {
  BrowserWindow.fromWebContents(event.sender)?.minimize()
})
ipcMain.handle('window:toggle-maximize', (event) => {
  const window = BrowserWindow.fromWebContents(event.sender)
  if (!window) return false
  if (window.isMaximized()) window.unmaximize()
  else window.maximize()
  return window.isMaximized()
})
ipcMain.handle('window:close', (event) => {
  BrowserWindow.fromWebContents(event.sender)?.close()
})

ipcMain.handle('dialog:choose-file', async (event): Promise<FirmwareFile | null> => {
  const owner = BrowserWindow.fromWebContents(event.sender)
  const options: OpenDialogOptions = {
    properties: ['openFile'],
    filters: [
      { name: '二进制固件', extensions: ['bin'] },
      { name: '所有文件', extensions: ['*'] },
    ],
  }
  const result = owner
    ? await dialog.showOpenDialog(owner, options)
    : await dialog.showOpenDialog(options)
  if (result.canceled || result.filePaths.length === 0) return null
  const filePath = result.filePaths[0]
  const stat = await fs.stat(filePath)
  if (!stat.isFile()) throw new Error('请选择普通固件文件')
  return {
    path: filePath,
    name: path.basename(filePath),
    size: stat.size,
  }
})

app.whenReady().then(() => {
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('before-quit', () => flashService.cancel())
app.on('window-all-closed', () => {
  void flashService.shutdown().finally(() => {
    if (process.platform !== 'darwin') app.quit()
  })
})
