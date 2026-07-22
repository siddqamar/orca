import { test, expect } from './helpers/orca-app'
import { BROWSER_GRAB_WORLD_ID } from '../../src/main/browser/browser-grab-script-executor'
import {
  buildGuestOverlayScript,
  buildGuestReactMetadataBridgeScript
} from '../../src/main/browser/grab-guest-script'

function buildAwaitClickProbe(awaitClickScript: string): string {
  return `(() => {
    window.__orcaGrab = {
      host: {
        addEventListener(type, listener) {
          if (type === 'click') {
            listener({
              preventDefault() {},
              stopPropagation() {},
              stopImmediatePropagation() {}
            })
          }
        },
        removeEventListener() {}
      },
      getCurrentElement: () => ({}),
      extractPayload: () => ({ page: {}, target: {} }),
      cleanup() {},
      freezeHighlight() {}
    }
    return eval(${JSON.stringify(awaitClickScript)})
  })()`
}

const INSTALL_ZONE_PROMISE_PATCH_SCRIPT = `(() => {
  window.__orcaNativePromise = window.Promise
  function ZoneAwarePromise(executor) {
    const wrapper = {
      __zone_symbol__state: true,
      __zone_symbol__value: undefined
    }
    executor(
      (value) => { wrapper.__zone_symbol__value = value },
      (reason) => { wrapper.__zone_symbol__value = reason }
    )
    return wrapper
  }
  window.Promise = ZoneAwarePromise
  return true
})()`

const RESTORE_ZONE_PROMISE_PATCH_SCRIPT = `(() => {
  window.Promise = window.__orcaNativePromise
  delete window.__orcaNativePromise
  return true
})()`

test('browser grab keeps await-click payload shape on Zone.js pages', async ({ electronApp }) => {
  const evidence = await electronApp.evaluate(
    async ({ BrowserWindow }, { isolatedWorldProbe, pageWorldProbe, worldId }) => {
      const browserWindow = new BrowserWindow({ show: false })
      try {
        await browserWindow.loadURL('data:text/html,<html><body>Grab probe</body></html>')
        await browserWindow.webContents.executeJavaScript(installPromisePatch)
        try {
          const pageWorldResult = await browserWindow.webContents.executeJavaScript(pageWorldProbe)
          const isolatedWorldResult =
            await browserWindow.webContents.executeJavaScriptInIsolatedWorld(
              worldId,
              [{ code: isolatedWorldProbe }],
              false
            )
          return {
            pageWorld: {
              directKeys: Object.keys(pageWorldResult),
              wrappedKeys: Object.keys(pageWorldResult.__zone_symbol__value ?? {}),
              hasDirectPage: Object.prototype.hasOwnProperty.call(pageWorldResult, 'page'),
              hasDirectTarget: Object.prototype.hasOwnProperty.call(pageWorldResult, 'target')
            },
            isolatedWorld: {
              directKeys: Object.keys(isolatedWorldResult),
              hasDirectPage: Object.prototype.hasOwnProperty.call(isolatedWorldResult, 'page'),
              hasDirectTarget: Object.prototype.hasOwnProperty.call(isolatedWorldResult, 'target')
            }
          }
        } finally {
          await browserWindow.webContents.executeJavaScript(restorePromisePatch)
        }
      } finally {
        browserWindow.destroy()
      }
    },
    {
      isolatedWorldProbe: buildAwaitClickProbe(buildGuestOverlayScript('awaitClick')),
      pageWorldProbe: buildAwaitClickProbe(buildGuestOverlayScript('awaitClick')),
      installPromisePatch: INSTALL_ZONE_PROMISE_PATCH_SCRIPT,
      restorePromisePatch: RESTORE_ZONE_PROMISE_PATCH_SCRIPT,
      worldId: BROWSER_GRAB_WORLD_ID
    }
  )

  expect(evidence.pageWorld).toMatchObject({
    directKeys: ['__zone_symbol__state', '__zone_symbol__value'],
    wrappedKeys: ['page', 'target'],
    hasDirectPage: false,
    hasDirectTarget: false
  })
  expect(evidence.isolatedWorld).toMatchObject({
    directKeys: ['page', 'target'],
    hasDirectPage: true,
    hasDirectTarget: true
  })
})

test('browser grab preserves React metadata across the isolated-world bridge', async ({
  electronApp
}) => {
  const metadata = await electronApp.evaluate(
    async (
      { BrowserWindow },
      {
        installBridge,
        teardownBridge,
        installPromisePatch,
        restorePromisePatch,
        armScript,
        teardownScript,
        worldId
      }
    ) => {
      const browserWindow = new BrowserWindow({ show: false })
      try {
        await browserWindow.loadURL('data:text/html,<button id="target">Grab me</button>')
        await browserWindow.webContents.executeJavaScript(`(() => {
          const target = document.getElementById('target')
          function SettingsPanel() {}
          target.__reactFiber$orcaProbe = {
            type: SettingsPanel,
            _debugSource: { fileName: 'src/settings-panel.tsx', lineNumber: 24, columnNumber: 7 },
            return: null
          }
          return true
        })()`)
        await browserWindow.webContents.executeJavaScript(installPromisePatch)
        await browserWindow.webContents.executeJavaScript(installBridge)
        try {
          await browserWindow.webContents.executeJavaScriptInIsolatedWorld(
            worldId,
            [{ code: armScript }],
            false
          )
          return await browserWindow.webContents.executeJavaScriptInIsolatedWorld(
            worldId,
            [{ code: `window.__orcaGrab.extractPayload(document.getElementById('target'))` }],
            false
          )
        } finally {
          await browserWindow.webContents.executeJavaScriptInIsolatedWorld(
            worldId,
            [{ code: teardownScript }],
            false
          )
          await browserWindow.webContents.executeJavaScript(teardownBridge)
          await browserWindow.webContents.executeJavaScript(restorePromisePatch)
        }
      } finally {
        browserWindow.destroy()
      }
    },
    {
      installBridge: buildGuestReactMetadataBridgeScript('install'),
      teardownBridge: buildGuestReactMetadataBridgeScript('teardown'),
      installPromisePatch: INSTALL_ZONE_PROMISE_PATCH_SCRIPT,
      restorePromisePatch: RESTORE_ZONE_PROMISE_PATCH_SCRIPT,
      armScript: buildGuestOverlayScript('arm'),
      teardownScript: buildGuestOverlayScript('teardown'),
      worldId: BROWSER_GRAB_WORLD_ID
    }
  )

  expect(metadata.target).toMatchObject({
    reactComponents: '<SettingsPanel>',
    sourceFile: 'src/settings-panel.tsx:24:7'
  })
})
