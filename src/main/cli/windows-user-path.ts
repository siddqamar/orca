import { execFile } from 'node:child_process'

const WINDOWS_PATH_COMMAND_TIMEOUT_MS = 5_000

export async function readWindowsUserPath(): Promise<string | null> {
  const stdout = await runWindowsPathCommand('reg.exe', ['query', 'HKCU\\Environment'])
  return parseWindowsUserPath(stdout)
}

export async function writeWindowsUserPath(value: string): Promise<void> {
  await runWindowsPathCommand('powershell', [
    '-NoProfile',
    '-Command',
    // Why: PATH registration stays user-scoped so desktop registration never needs elevation.
    `[Environment]::SetEnvironmentVariable('Path', ${quotePowerShell(value)}, 'User')`
  ])
}

function runWindowsPathCommand(command: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    let child: ReturnType<typeof execFile> | null = null
    let settled = false

    const finish = (error: Error | null, stdout = ''): void => {
      if (settled) {
        return
      }
      settled = true
      clearTimeout(timeout)
      if (error) {
        reject(error)
        return
      }
      resolve(stdout)
    }

    // Why: a wedged OS command must not keep CLI status or registration pending forever.
    const timeout = setTimeout(() => {
      child?.kill()
      finish(
        new Error(`Windows PATH command timed out after ${WINDOWS_PATH_COMMAND_TIMEOUT_MS}ms.`)
      )
    }, WINDOWS_PATH_COMMAND_TIMEOUT_MS)

    try {
      child = execFile(
        command,
        args,
        { encoding: 'utf8', timeout: WINDOWS_PATH_COMMAND_TIMEOUT_MS },
        (error, stdout) => finish(error ?? null, stdout)
      )
    } catch (error) {
      finish(error instanceof Error ? error : new Error(String(error)))
    }
  })
}

export function parseWindowsUserPath(stdout: string): string | null {
  const match = stdout.match(/^\s*Path\s+REG_(?:EXPAND_)?SZ(?:\s+(.*))?$/imu)
  return match?.[1]?.trim() || null
}

function quotePowerShell(value: string): string {
  return `'${value.replaceAll("'", "''")}'`
}
