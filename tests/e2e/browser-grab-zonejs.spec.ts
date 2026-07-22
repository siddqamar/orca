import { test, expect } from './helpers/orca-app'
import { BROWSER_GRAB_WORLD_ID } from '../../src/main/browser/browser-grab-script-executor'
import { buildGuestOverlayScript } from '../../src/main/browser/grab-guest-script'

function buildAwaitClickProbe(awaitClickScript: string, patchPromise: boolean): string {
  const promisePatch = patchPromise
    ? `
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
    `
    : ''

  return `(() => {
    const nativePromise = window.Promise
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
    ${promisePatch}
    try {
      return eval(${JSON.stringify(awaitClickScript)})
    } finally {
      window.Promise = nativePromise
    }
  })()`
}

test('browser grab keeps await-click payload shape on Zone.js pages', async ({ electronApp }) => {
  const evidence = await electronApp.evaluate(
    async ({ BrowserWindow }, { isolatedWorldProbe, pageWorldProbe, worldId }) => {
      const browserWindow = new BrowserWindow({ show: false })
      try {
        await browserWindow.loadURL('data:text/html,<html><body>Grab probe</body></html>')
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
        browserWindow.destroy()
      }
    },
    {
      isolatedWorldProbe: buildAwaitClickProbe(buildGuestOverlayScript('awaitClick'), false),
      pageWorldProbe: buildAwaitClickProbe(buildGuestOverlayScript('awaitClick'), true),
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
