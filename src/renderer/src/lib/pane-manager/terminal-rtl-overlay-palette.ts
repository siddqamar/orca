import type { Terminal } from '@xterm/xterm'

const ANSI_THEME_KEYS = [
  'black',
  'red',
  'green',
  'yellow',
  'blue',
  'magenta',
  'cyan',
  'white',
  'brightBlack',
  'brightRed',
  'brightGreen',
  'brightYellow',
  'brightBlue',
  'brightMagenta',
  'brightCyan',
  'brightWhite'
] as const

const DEFAULT_ANSI_COLORS = [
  '#2e3436',
  '#cc0000',
  '#4e9a06',
  '#c4a000',
  '#3465a4',
  '#75507b',
  '#06989a',
  '#d3d7cf',
  '#555753',
  '#ef2929',
  '#8ae234',
  '#fce94f',
  '#729fcf',
  '#ad7fa8',
  '#34e2e2',
  '#eeeeec'
]

export function resolveTerminalAnsiPalette(theme: Terminal['options']['theme']): string[] {
  const colors = [...DEFAULT_ANSI_COLORS]
  const colorSteps = [0x00, 0x5f, 0x87, 0xaf, 0xd7, 0xff]

  for (let index = 0; index < 216; index += 1) {
    const red = colorSteps[((index / 36) | 0) % 6]
    const green = colorSteps[((index / 6) | 0) % 6]
    const blue = colorSteps[index % 6]
    colors.push(formatRgb(red, green, blue))
  }

  for (let index = 0; index < 24; index += 1) {
    const channel = 8 + index * 10
    colors.push(formatRgb(channel, channel, channel))
  }

  ANSI_THEME_KEYS.forEach((key, index) => {
    if (theme?.[key]) {
      colors[index] = theme[key]
    }
  })
  theme?.extendedAnsi?.forEach((color, index) => {
    const paletteIndex = index + 16
    if (paletteIndex < colors.length && color) {
      colors[paletteIndex] = color
    }
  })

  return colors
}

function formatRgb(red: number, green: number, blue: number): string {
  return `#${red.toString(16).padStart(2, '0')}${green
    .toString(16)
    .padStart(2, '0')}${blue.toString(16).padStart(2, '0')}`
}
