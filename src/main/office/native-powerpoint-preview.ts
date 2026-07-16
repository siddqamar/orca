import { execFile } from 'node:child_process'
import { mkdtemp, mkdir, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import type {
  NativePowerPointPreviewRequest,
  NativePowerPointPreviewResult
} from '../../shared/powerpoint-preview'
import { NATIVE_POWERPOINT_PREVIEW_SCRIPT } from './native-powerpoint-preview-script'

const execFileAsync = promisify(execFile)
const POWERPOINT_EXPORT_TIMEOUT_MS = 180_000
const MINIMUM_PREVIEW_BYTES = 1_000

type NativePowerPointPreviewDependencies = {
  platform: NodeJS.Platform
  createTemporaryDirectory: () => Promise<string>
  createDirectory: (path: string) => Promise<void>
  writeFile: (path: string, content: string | Buffer) => Promise<void>
  readFile: (path: string) => Promise<Buffer>
  removeDirectory: (path: string) => Promise<void>
  runPowerShell: (args: string[]) => Promise<void>
}

const defaultDependencies: NativePowerPointPreviewDependencies = {
  platform: process.platform,
  createTemporaryDirectory: async () => {
    const directory = await mkdtemp(join(tmpdir(), 'orca-pptx-preview-'))
    // Why: Windows can expose %TEMP% through an 8.3 path, which PowerPoint's
    // SaveAs COM method rejects even though regular filesystem APIs accept it.
    return realpath(directory)
  },
  createDirectory: async (path) => {
    await mkdir(path, { recursive: true })
  },
  writeFile,
  readFile,
  removeDirectory: async (path) => {
    await rm(path, { recursive: true, force: true })
  },
  runPowerShell: async (args) => {
    await execFileAsync('powershell.exe', args, {
      timeout: POWERPOINT_EXPORT_TIMEOUT_MS,
      windowsHide: true,
      maxBuffer: 1024 * 1024
    })
  }
}

function unavailable(reason: unknown): NativePowerPointPreviewResult {
  const message = reason instanceof Error ? reason.message : String(reason)
  return { status: 'unavailable', reason: message }
}

export async function renderNativePowerPointPreview(
  request: NativePowerPointPreviewRequest,
  dependencies: NativePowerPointPreviewDependencies = defaultDependencies
): Promise<NativePowerPointPreviewResult> {
  if (dependencies.platform !== 'win32') {
    return unavailable('Native PowerPoint rendering is only available on Windows.')
  }
  if (!request.contentBase64) {
    return unavailable('The presentation is empty.')
  }

  let temporaryDirectory: string | null = null
  try {
    temporaryDirectory = await dependencies.createTemporaryDirectory()
    const inputPath = join(temporaryDirectory, 'source.pptx')
    const outputPath = join(temporaryDirectory, 'preview.pptx')
    const scriptPath = join(temporaryDirectory, 'render-preview.ps1')
    const imageDirectory = join(temporaryDirectory, 'slides')
    await dependencies.createDirectory(imageDirectory)
    await Promise.all([
      dependencies.writeFile(inputPath, Buffer.from(request.contentBase64, 'base64')),
      dependencies.writeFile(scriptPath, NATIVE_POWERPOINT_PREVIEW_SCRIPT)
    ])
    await dependencies.runPowerShell([
      '-NoLogo',
      '-NoProfile',
      '-NonInteractive',
      '-ExecutionPolicy',
      'Bypass',
      '-File',
      scriptPath,
      '-InputPath',
      inputPath,
      '-OutputPath',
      outputPath,
      '-ImageDirectory',
      imageDirectory
    ])
    const preview = await dependencies.readFile(outputPath)
    if (preview.byteLength < MINIMUM_PREVIEW_BYTES || preview.subarray(0, 2).toString() !== 'PK') {
      throw new Error('PowerPoint did not create a valid preview presentation.')
    }
    return { status: 'rendered', contentBase64: preview.toString('base64') }
  } catch (error) {
    return unavailable(error)
  } finally {
    if (temporaryDirectory) {
      await dependencies.removeDirectory(temporaryDirectory).catch(() => undefined)
    }
  }
}
