// Why: keep grab state and Promise resolution away from page-patched globals.
export const BROWSER_GRAB_WORLD_ID = 1209

export function executeBrowserGrabScript(
  guest: Electron.WebContents,
  script: string
): Promise<unknown> {
  return guest.executeJavaScriptInIsolatedWorld(BROWSER_GRAB_WORLD_ID, [{ code: script }], false)
}
