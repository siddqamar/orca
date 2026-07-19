import { beforeEach, describe, expect, it, vi } from 'vitest'

const execFileMock = vi.hoisted(() => vi.fn())

vi.mock('node:child_process', () => ({
  execFile: execFileMock
}))

import { parseWindowsUserPath, readWindowsUserPath } from './windows-user-path'

beforeEach(() => {
  execFileMock.mockReset()
})

it('reads the user PATH through the native registry command', async () => {
  execFileMock.mockImplementation((_command, _args, _options, callback) => {
    callback(null, '\nHKEY_CURRENT_USER\\Environment\n    Path    REG_SZ    C:\\Tools\n')
    return { kill: vi.fn() }
  })

  await expect(readWindowsUserPath()).resolves.toBe('C:\\Tools')
  expect(execFileMock).toHaveBeenCalledWith(
    'reg.exe',
    ['query', 'HKCU\\Environment'],
    expect.objectContaining({ encoding: 'utf8' }),
    expect.any(Function)
  )
})

describe('parseWindowsUserPath', () => {
  it.each(['REG_SZ', 'REG_EXPAND_SZ'])(
    'reads a %s user PATH from reg.exe output',
    (registryType) => {
      const stdout = `\nHKEY_CURRENT_USER\\Environment\n    TEMP    REG_EXPAND_SZ    %USERPROFILE%\\AppData\\Local\\Temp\n    Path    ${registryType}    C:\\Tools;C:\\Program Files\\Orca\n`

      expect(parseWindowsUserPath(stdout)).toBe('C:\\Tools;C:\\Program Files\\Orca')
    }
  )

  it('returns null when the user has no PATH registry value', () => {
    expect(
      parseWindowsUserPath('\nHKEY_CURRENT_USER\\Environment\n    TEMP    REG_SZ    C:\\Temp\n')
    ).toBeNull()
  })
})
