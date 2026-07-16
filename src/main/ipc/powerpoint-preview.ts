import { ipcMain } from 'electron'
import type { NativePowerPointPreviewRequest } from '../../shared/powerpoint-preview'
import { renderNativePowerPointPreview } from '../office/native-powerpoint-preview'

export function registerPowerPointPreviewHandlers(): void {
  ipcMain.handle('powerpointPreview:render', (_event, request: NativePowerPointPreviewRequest) =>
    renderNativePowerPointPreview(request)
  )
}
