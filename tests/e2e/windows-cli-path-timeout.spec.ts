import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { expect, test as base } from './helpers/orca-app'
import { waitForSessionReady } from './helpers/store'

const fakePowerShellDir = mkdtempSync(path.join(os.tmpdir(), 'orca-e2e-slow-powershell-'))
writeFileSync(
  path.join(fakePowerShellDir, 'powershell.cmd'),
  '@echo off\r\nping -n 8 127.0.0.1 >nul\r\n'
)

const test = base.extend({
  launchEnv: [
    {
      PATH: `${fakePowerShellDir}${path.delimiter}${process.env.PATH ?? ''}`
    },
    { option: true }
  ]
})

test.afterAll(() => {
  rmSync(fakePowerShellDir, { recursive: true, force: true })
})

test('Windows CLI status survives a slow PowerShell PATH probe', async ({ orcaPage }) => {
  test.skip(process.platform !== 'win32', 'Windows PATH registration only runs on Windows.')
  await waitForSessionReady(orcaPage)

  await orcaPage.evaluate(() => {
    const store = window.__store
    if (!store) {
      throw new Error('window.__store is not available')
    }
    store.getState().openSettingsTarget({ pane: 'general', repoId: null, sectionId: 'cli' })
    store.getState().openSettingsPage()
  })

  await expect(orcaPage.getByRole('heading', { name: 'Orca CLI', exact: true })).toBeVisible()
  await expect(orcaPage.getByText('Checking CLI registration…')).not.toBeVisible({
    timeout: 10_000
  })
  await expect(orcaPage.getByText(/Windows PATH command timed out/)).toHaveCount(0)
})
