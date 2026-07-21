import { readFile } from 'node:fs/promises'
import { test, expect } from './helpers/orca-app'
import { waitForActiveWorktree, waitForSessionReady } from './helpers/store'
import {
  cleanupMarkdownFixture,
  createMarkdownFixture,
  getActiveWorktreeContext,
  openMarkdownFixture,
  waitForRichMarkdownEditor
} from './helpers/markdown-ordered-list-exit'

const INITIAL_MARKDOWN = '# Save shortcut repro\n\nOriginal content.\n'
const EDITED_MARKDOWN = 'Edited from rich Markdown mode.'
const MULTIBYTE_MARKDOWN =
  '# 导出表检测\n\n对比未 hook 的函数的指令：\n\n## 采集项不一致检测\n\n原始内容。\n'
const MULTIBYTE_EDIT = 'dfadsf\nsdf\nsd\nf'

test.describe('Markdown save shortcut on Windows', () => {
  test.skip(process.platform !== 'win32', 'Issue #9730 is Windows-specific')

  test('Ctrl+S persists edits made in rich Markdown mode', async ({ orcaPage }, testInfo) => {
    await orcaPage.setViewportSize({ width: 1440, height: 900 })
    await waitForSessionReady(orcaPage)
    await waitForActiveWorktree(orcaPage)

    const context = await getActiveWorktreeContext(orcaPage)
    const filePath = await createMarkdownFixture(
      context,
      'save-shortcut-windows',
      testInfo.workerIndex,
      INITIAL_MARKDOWN
    )

    try {
      await openMarkdownFixture(orcaPage, context, filePath)
      const editor = await waitForRichMarkdownEditor(orcaPage)
      await editor.click()
      await orcaPage.keyboard.press('Control+End')
      await orcaPage.keyboard.type(`\n${EDITED_MARKDOWN}`)

      await orcaPage.keyboard.press('Control+S')

      await expect
        .poll(() => readFile(filePath, 'utf8'), {
          timeout: 5_000,
          message: 'Ctrl+S did not persist the rich Markdown edit to disk'
        })
        .toContain(EDITED_MARKDOWN)
    } finally {
      await cleanupMarkdownFixture(filePath)
    }
  })

  test('switching away persists rich Markdown edits with auto-save enabled', async ({
    orcaPage
  }, testInfo) => {
    await orcaPage.setViewportSize({ width: 1440, height: 900 })
    await waitForSessionReady(orcaPage)
    await waitForActiveWorktree(orcaPage)

    await orcaPage.evaluate(() => {
      window.__store?.getState().updateSettings({
        editorAutoSave: true,
        editorAutoSaveDelayMs: 100
      })
    })

    const context = await getActiveWorktreeContext(orcaPage)
    const filePath = await createMarkdownFixture(
      context,
      'switch-away-windows',
      testInfo.workerIndex,
      MULTIBYTE_MARKDOWN
    )

    try {
      await openMarkdownFixture(orcaPage, context, filePath)
      const editor = await waitForRichMarkdownEditor(orcaPage)
      await editor.click()
      await orcaPage.keyboard.press('Control+End')
      await orcaPage.keyboard.type(`\n${MULTIBYTE_EDIT}`)

      await orcaPage.evaluate(() => {
        window.__store?.getState().setActiveTabType('terminal')
      })

      await expect
        .poll(() => readFile(filePath, 'utf8'), {
          timeout: 5_000,
          message: 'Switching away did not auto-save the rich Markdown edit to disk'
        })
        .toContain(MULTIBYTE_EDIT)
    } finally {
      await cleanupMarkdownFixture(filePath)
    }
  })
})
