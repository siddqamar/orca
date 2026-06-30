import { _electron as electron } from '@playwright/test'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath as fileUrlToPath } from 'node:url'

const ARABIC_SAMPLE =
  '\u0645\u0631\u062d\u0628\u0627\u064b \u0647\u0630\u0647 \u0645\u0634\u0643\u0644\u0629 \u0641\u064a \u0627\u0644\u0644\u063a\u0629 \u0627\u0644\u0639\u0631\u0628\u064a\u0629'
const outputDir = path.join(process.cwd(), 'test-results', 'manual-arabic-xterm-isolation')
const tempDir = mkdtempSync(path.join(os.tmpdir(), 'orca-arabic-xterm-'))

mkdirSync(outputDir, { recursive: true })

const xtermPath = requireResolve('@xterm/xterm')
const unicode11Path = requireResolve('@xterm/addon-unicode11')
const webglPath = requireResolve('@xterm/addon-webgl')
const xtermCss = readFileSync(
  path.join(path.dirname(xtermPath), '..', 'css', 'xterm.css'),
  'utf8'
)

const mainPath = path.join(tempDir, 'main.cjs')
writeFileSync(
  mainPath,
  `
const { app, BrowserWindow } = require('electron')

const mode = process.argv.includes('webgl-joiner')
  ? 'webgl-joiner'
  : process.argv.includes('webgl')
    ? 'webgl'
    : 'dom'
const sample = ${JSON.stringify(ARABIC_SAMPLE)}
const xtermPath = ${JSON.stringify(xtermPath)}
const unicode11Path = ${JSON.stringify(unicode11Path)}
const webglPath = ${JSON.stringify(webglPath)}
const xtermCss = ${JSON.stringify(xtermCss)}

function html() {
  return \`<!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <style>
          \${xtermCss}
          body {
            margin: 0;
            background: #111;
            color: #eee;
            font-family: Arial, sans-serif;
          }
          #control {
            position: absolute;
            left: 20px;
            top: 16px;
            font: 20px Consolas, "Courier New", monospace;
            direction: rtl;
            unicode-bidi: isolate;
            color: #9ae6b4;
          }
          #terminal {
            position: absolute;
            left: 20px;
            top: 72px;
            width: 900px;
            height: 240px;
          }
        </style>
      </head>
      <body>
        <div id="control"></div>
        <div id="terminal"></div>
        <script>
          const { Terminal } = require(\${JSON.stringify(xtermPath)})
          const { Unicode11Addon } = require(\${JSON.stringify(unicode11Path)})
          const { WebglAddon } = require(\${JSON.stringify(webglPath)})
          const mode = \${JSON.stringify(mode)}
          const sample = \${JSON.stringify(sample)}
          const control = document.getElementById('control')
          control.textContent = sample
          const terminal = new Terminal({
            cols: 80,
            rows: 8,
            allowProposedApi: true,
            fontFamily: 'Consolas, "Courier New", monospace',
            fontSize: 22,
            lineHeight: 1.2,
            theme: { background: '#111111', foreground: '#eeeeee' }
          })
          terminal.open(document.getElementById('terminal'))
          terminal.loadAddon(new Unicode11Addon())
          terminal.unicode.activeVersion = '11'
          let webglLoaded = false
          if (mode === 'webgl-joiner') {
            terminal.registerCharacterJoiner((text) => {
              const ranges = []
              const pattern = /[\\u0590-\\u08ff]+(?:\\s+[\\u0590-\\u08ff]+)*/gu
              for (const match of text.matchAll(pattern)) {
                ranges.push([match.index, match.index + match[0].length])
              }
              return ranges
            })
          }
          if (mode === 'webgl' || mode === 'webgl-joiner') {
            try {
              const webgl = new WebglAddon()
              terminal.loadAddon(webgl)
              webglLoaded = true
            } catch (error) {
              window.__webglError = String(error && error.message ? error.message : error)
            }
          }
          terminal.write('ARABIC_ISOLATION_START\\\\r\\\\n' + sample + '\\\\r\\\\nARABIC_ISOLATION_END\\\\r\\\\n', () => {
            const buffer = terminal.buffer.active
            const lineCount = buffer.baseY + buffer.length
            const lines = Array.from({ length: lineCount }, (_, index) =>
              buffer.getLine(index)?.translateToString(true) ?? ''
            )
            const domRows = Array.from(document.querySelectorAll('.xterm-rows > div')).map((row) => row.textContent ?? '')
            const spans = Array.from(document.querySelectorAll('.xterm-rows span')).map((span) => ({
              text: span.textContent ?? '',
              rect: span.getBoundingClientRect().toJSON()
            }))
            window.__xtermArabicResult = {
              mode,
              sample,
              webglLoaded,
              webglError: window.__webglError ?? null,
              bufferLine: lines.find((line) => line.includes(sample)) ?? null,
              domRows,
              spansWithArabic: spans.filter((span) => /[\\\\u0600-\\\\u06ff]/u.test(span.text)),
              controlText: control.textContent,
              userAgent: navigator.userAgent
            }
          })
        </script>
      </body>
    </html>\`
}

app.whenReady().then(() => {
  const win = new BrowserWindow({
    width: 980,
    height: 360,
    show: false,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      sandbox: false
    }
  })
  win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html()))
})
`,
  'utf8'
)

const results = []
try {
  for (const mode of ['dom', 'webgl', 'webgl-joiner']) {
    const userDataDir = path.join(tempDir, `profile-${mode}`)
    const app = await electron.launch({
      args: [
        `--user-data-dir=${userDataDir}`,
        '--disable-gpu-sandbox',
        '--disable-dev-shm-usage',
        '--in-process-gpu',
        mainPath,
        mode
      ],
      cwd: process.cwd(),
      env: {
        ...process.env,
        ELECTRON_DISABLE_SECURITY_WARNINGS: 'true'
      }
    })
    app.process().stdout?.on('data', (chunk) => {
      process.stdout.write(`[electron:${mode}:stdout] ${chunk}`)
    })
    app.process().stderr?.on('data', (chunk) => {
      process.stderr.write(`[electron:${mode}:stderr] ${chunk}`)
    })
    const page = await app.firstWindow({ timeout: 30_000 })
    await page.waitForFunction(() => Boolean(window.__xtermArabicResult), null, {
      timeout: 30_000
    })
    const result = await page.evaluate(() => window.__xtermArabicResult)
    const screenshotPath = path.join(outputDir, `xterm-arabic-${mode}.png`)
    await page.screenshot({ path: screenshotPath, fullPage: true })
    results.push({ ...result, screenshotPath })
    await app.close()
  }
} finally {
  rmSync(tempDir, { recursive: true, force: true })
}

console.log(JSON.stringify(results, null, 2))

function requireResolve(specifier) {
  return path.normalize(
    import.meta.resolve ? fileUrlToPath(import.meta.resolve(specifier)) : require.resolve(specifier)
  )
}
