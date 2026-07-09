import type { SshConnection } from './ssh-connection'
import {
  getProcessOutputFields,
  iterateProcessOutputLines
} from '../../shared/process-output-field-scanner'
import { parseUnameToRelayPlatform, type RelayPlatform } from './relay-protocol'
import { execCommand } from './ssh-relay-deploy-helpers'
import { getRemoteHostPlatform, type RemoteHostPlatform } from './ssh-remote-platform'
import { powerShellCommand } from './ssh-remote-powershell'

export async function detectRemoteHostPlatform(
  conn: SshConnection
): Promise<RemoteHostPlatform | null> {
  const unamePlatform = await detectUnamePlatform(conn)
  if (unamePlatform) {
    return getRemoteHostPlatform(unamePlatform)
  }
  const windowsPlatform = await detectWindowsPlatform(conn)
  return windowsPlatform ? getRemoteHostPlatform(windowsPlatform) : null
}

async function detectUnamePlatform(conn: SshConnection): Promise<RelayPlatform | null> {
  try {
    const output = await execCommand(conn, 'uname -sm')
    return parseRemotePlatformOutput(output)
  } catch {
    return null
  }
}

async function detectWindowsPlatform(conn: SshConnection): Promise<RelayPlatform | null> {
  try {
    const script = [
      '$arch = $env:PROCESSOR_ARCHITECTURE',
      'try { $runtimeArch = [System.Runtime.InteropServices.RuntimeInformation]::OSArchitecture.ToString(); if ($runtimeArch) { $arch = $runtimeArch } } catch {}',
      'if (-not $arch) { $arch = $env:PROCESSOR_ARCHITECTURE }',
      'Write-Output ("Windows " + $arch)'
    ].join('; ')
    const output = await execCommand(conn, powerShellCommand(script), { wrapCommand: false })
    return parseRemotePlatformOutput(output)
  } catch {
    return null
  }
}

function parseRemotePlatformOutput(output: string): RelayPlatform | null {
  // Why: Windows PowerShell/OpenSSH can prepend first-use CLIXML or banners
  // before the probe marker; scan lines until a supported marker appears.
  for (const line of iterateProcessOutputLines(output)) {
    const parts = getProcessOutputFields(line, 2)
    if (parts.length < 2) {
      continue
    }
    const platform = parseUnameToRelayPlatform(parts[0], parts[1])
    if (platform) {
      return platform
    }
  }
  return null
}
