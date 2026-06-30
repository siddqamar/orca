import { randomUUID } from 'node:crypto'
import type { Page, TestInfo } from '@stablyai/playwright-test'
import { test, expect } from './helpers/orca-app'
import { ensureTerminalVisible, waitForSessionReady } from './helpers/store'
import {
  getTerminalContent,
  waitForActivePaneHookDescriptor,
  waitForActivePanePtyId,
  waitForActiveTerminalManager
} from './helpers/terminal'

const ARABIC_SAMPLE =
  '\u0645\u0631\u062d\u0628\u0627\u064b \u0647\u0630\u0647 \u0645\u0634\u0643\u0644\u0629 \u0641\u064a \u0627\u0644\u0644\u063a\u0629 \u0627\u0644\u0639\u0631\u0628\u064a\u0629'

type ArabicRenderDiagnostics = {
  bufferLine: string | null
  domRowsText: string[]
  hasDomRows: boolean
  hasWebgl: boolean
  hasComplexScriptOutput: boolean
  terminalGpuAcceleration?: string
  fontFamily: string | null
  userAgent: string
}

async function configureTerminalRenderer(
  page: Page,
  terminalGpuAcceleration: 'off' | 'on'
): Promise<void> {
  await page.evaluate((mode) => {
    const store = window.__store
    if (!store) {
      throw new Error('Store unavailable')
    }
    store.getState().updateSettings({
      terminalGpuAcceleration: mode,
      terminalFontFamily: 'Consolas'
    })
  }, terminalGpuAcceleration)
}

async function injectArabicOutput(page: Page, marker: string): Promise<void> {
  const descriptor = await waitForActivePaneHookDescriptor(page)
  await page.evaluate(
    ({ paneKey, marker, sample }) => {
      const injected = window.__terminalPtyDataInjection?.inject(
        paneKey,
        `ARABIC_REPRO_START_${marker}\r\n${sample}\r\nARABIC_REPRO_END_${marker}\r\n`,
        { foreground: true }
      )
      if (!injected) {
        throw new Error(`No PTY injection handler for ${paneKey}`)
      }
    },
    { paneKey: descriptor.paneKey, marker, sample: ARABIC_SAMPLE }
  )
}

async function readArabicRenderDiagnostics(page: Page): Promise<ArabicRenderDiagnostics> {
  return page.evaluate((sample) => {
    const store = window.__store
    const state = store?.getState()
    const worktreeId = state?.activeWorktreeId
    const tabId =
      state?.activeTabType === 'terminal'
        ? state.activeTabId
        : worktreeId
          ? (state?.activeTabIdByWorktree?.[worktreeId] ?? null)
          : null
    const manager = tabId ? window.__paneManagers?.get(tabId) : null
    const pane = manager?.getActivePane?.() ?? manager?.getPanes?.()[0] ?? null
    if (!pane) {
      throw new Error('Active terminal pane unavailable')
    }
    const diagnostics = manager
      ?.getRenderingDiagnostics()
      .find((entry) => entry.paneId === pane.id)
    const buffer = pane.terminal.buffer.active
    const lineCount = buffer.baseY + buffer.length
    const lines = Array.from(
      { length: lineCount },
      (_, index) => buffer.getLine(index)?.translateToString(true) ?? ''
    )
    const domRows = Array.from(
      pane.container.querySelectorAll<HTMLElement>('.xterm-rows > div')
    ).map((row) => row.textContent ?? '')
    const textarea = pane.container.querySelector<HTMLTextAreaElement>('.xterm-helper-textarea')

    return {
      bufferLine: lines.find((line) => line.includes(sample)) ?? null,
      domRowsText: domRows.filter((line) => line.includes(sample) || /[\u0600-\u06ff]/u.test(line)),
      hasDomRows: domRows.length > 0,
      hasWebgl: diagnostics?.hasWebgl ?? false,
      hasComplexScriptOutput: diagnostics?.hasComplexScriptOutput ?? false,
      terminalGpuAcceleration: diagnostics?.terminalGpuAcceleration,
      fontFamily: textarea ? getComputedStyle(textarea).fontFamily : null,
      userAgent: navigator.userAgent
    }
  }, ARABIC_SAMPLE)
}

async function prepareArabicTerminal(page: Page, renderer: 'dom' | 'webgl'): Promise<string> {
  await waitForSessionReady(page)
  await configureTerminalRenderer(page, renderer === 'dom' ? 'off' : 'on')
  await ensureTerminalVisible(page)
  await waitForActiveTerminalManager(page, 30_000)
  await waitForActivePanePtyId(page)
  const marker = randomUUID()
  await injectArabicOutput(page, marker)
  await expect
    .poll(() => getTerminalContent(page, 8_000), {
      timeout: 10_000,
      message: 'Arabic repro output did not reach the terminal buffer'
    })
    .toContain(`ARABIC_REPRO_END_${marker}`)
  await expect.poll(() => getTerminalContent(page, 8_000)).toContain(ARABIC_SAMPLE)
  return marker
}

async function attachScreenshot(page: Page, testInfo: TestInfo, name: string): Promise<void> {
  const screenshotPath = testInfo.outputPath(`${name}.png`)
  await page.screenshot({ path: screenshotPath, fullPage: true })
  await testInfo.attach(`${name}.png`, { path: screenshotPath, contentType: 'image/png' })
}

test.describe('Terminal Arabic rendering repro', () => {
  test('captures Arabic rendering evidence on the DOM renderer', async ({
    orcaPage
  }, testInfo) => {
    const marker = await prepareArabicTerminal(orcaPage, 'dom')
    const diagnostics = await readArabicRenderDiagnostics(orcaPage)

    testInfo.annotations.push({
      type: 'arabic-dom-render-diagnostics',
      description: JSON.stringify({ marker, diagnostics })
    })
    await attachScreenshot(orcaPage, testInfo, 'terminal-arabic-dom-renderer')

    expect(diagnostics.hasWebgl).toBe(false)
    expect(diagnostics.bufferLine).toContain(ARABIC_SAMPLE)
    expect(diagnostics.hasComplexScriptOutput).toBe(false)
    expect(diagnostics.domRowsText.join('\n')).toContain(ARABIC_SAMPLE)
  })

  test('captures Arabic rendering evidence on the WebGL renderer', async ({
    orcaPage
  }, testInfo) => {
    const marker = await prepareArabicTerminal(orcaPage, 'webgl')
    const diagnostics = await readArabicRenderDiagnostics(orcaPage)

    testInfo.annotations.push({
      type: 'arabic-webgl-render-diagnostics',
      description: JSON.stringify({ marker, diagnostics })
    })
    await attachScreenshot(orcaPage, testInfo, 'terminal-arabic-webgl-renderer')

    expect(diagnostics.hasWebgl).toBe(true)
    expect(diagnostics.bufferLine).toContain(ARABIC_SAMPLE)
    expect(diagnostics.hasComplexScriptOutput).toBe(false)
  })
})
