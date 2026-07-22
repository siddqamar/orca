import { describe, expect, it, vi } from 'vitest'
import { BROWSER_GRAB_WORLD_ID, executeBrowserGrabScript } from './browser-grab-script-executor'

describe('executeBrowserGrabScript', () => {
  it('runs grab scripts in the dedicated isolated world', async () => {
    const executeJavaScriptInIsolatedWorld = vi.fn().mockResolvedValue({ page: {}, target: {} })
    const guest = { executeJavaScriptInIsolatedWorld } as unknown as Electron.WebContents

    await executeBrowserGrabScript(
      guest,
      'new Promise((resolve) => resolve({ page: {}, target: {} }))'
    )

    expect(executeJavaScriptInIsolatedWorld).toHaveBeenCalledWith(
      BROWSER_GRAB_WORLD_ID,
      [{ code: 'new Promise((resolve) => resolve({ page: {}, target: {} }))' }],
      false
    )
  })
})
