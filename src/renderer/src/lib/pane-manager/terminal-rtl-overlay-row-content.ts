import type { Terminal } from '@xterm/xterm'
import { resolveTerminalAnsiPalette } from './terminal-rtl-overlay-palette'

const TRANSPARENT_COLORS = new Set(['transparent', 'rgba(0, 0, 0, 0)'])
const XTERM_COLOR_MODE_DEFAULT = 0
const XTERM_COLOR_MODE_P16 = 0x1000000
const XTERM_COLOR_MODE_P256 = 0x2000000
const XTERM_COLOR_MODE_RGB = 0x3000000

export type BufferCellLike = {
  getBgColor(): number
  getBgColorMode(): number
  getChars(): string
  getFgColor(): number
  getFgColorMode(): number
  getWidth(): number
  isBold(): number
  isDim(): number
  isInvisible(): number
  isInverse(): number
  isItalic(): number
  isStrikethrough(): number
  isUnderline(): number
}

export type BufferLineLike = {
  length: number
  getCell(x: number, cell?: BufferCellLike): BufferCellLike | undefined
  translateToString(trimRight?: boolean, startColumn?: number, endColumn?: number): string
}

type RtlTextStyle = {
  backgroundColor: string
  color: string
  fontStyle: string
  fontWeight: string
  opacity: string
  textDecoration: string
}

export type RtlRowStyle = {
  ansiPalette: string[]
  backgroundColor: string
  color: string
  drawBoldTextInBrightColors: boolean
  fontFamily: string
  fontSize: string
  fontStyle: string
  fontWeight: string
  fontWeightBold: string
  letterSpacing: string
}

type RtlTextSegment = {
  style: RtlTextStyle
  text: string
}

export function renderTerminalRtlOverlayRow(
  rowElement: HTMLElement,
  row: { bufferLine: number; text: string },
  terminal: Terminal,
  rowStyle: RtlRowStyle,
  nullCell: BufferCellLike
): void {
  const line = terminal.buffer.active.getLine(row.bufferLine)
  if (!line) {
    rowElement.textContent = row.text
    return
  }

  const segments = collectRtlTextSegments(line, terminal.cols, rowStyle, nullCell)
  if (segments.length === 0) {
    rowElement.textContent = row.text
    return
  }

  const fragment = document.createDocumentFragment()
  for (const segment of segments) {
    const span = document.createElement('span')
    span.textContent = segment.text
    span.style.color = segment.style.color
    span.style.backgroundColor = segment.style.backgroundColor
    span.style.fontStyle = segment.style.fontStyle
    span.style.fontWeight = segment.style.fontWeight
    span.style.opacity = segment.style.opacity
    span.style.textDecoration = segment.style.textDecoration
    fragment.appendChild(span)
  }
  rowElement.replaceChildren(fragment)
}

export function resolveTerminalRtlRowStyle(
  terminal: Terminal,
  screenElement: HTMLElement
): RtlRowStyle {
  const computedStyle = getComputedStyle(screenElement)
  const theme = terminal.options.theme
  const backgroundColor = theme?.background ?? resolveComputedBackground(computedStyle)

  return {
    ansiPalette: resolveAnsiPalette(theme),
    backgroundColor,
    color: theme?.foreground ?? computedStyle.color,
    drawBoldTextInBrightColors: terminal.options.drawBoldTextInBrightColors ?? true,
    fontFamily: terminal.options.fontFamily ?? computedStyle.fontFamily,
    fontSize:
      typeof terminal.options.fontSize === 'number'
        ? `${terminal.options.fontSize}px`
        : computedStyle.fontSize,
    fontStyle: computedStyle.fontStyle,
    fontWeight:
      terminal.options.fontWeight == null
        ? computedStyle.fontWeight
        : String(terminal.options.fontWeight),
    fontWeightBold:
      terminal.options.fontWeightBold == null
        ? computedStyle.fontWeight
        : String(terminal.options.fontWeightBold),
    letterSpacing:
      typeof terminal.options.letterSpacing === 'number'
        ? `${terminal.options.letterSpacing}px`
        : computedStyle.letterSpacing
  }
}

function collectRtlTextSegments(
  line: BufferLineLike,
  columnCount: number,
  rowStyle: RtlRowStyle,
  nullCell: BufferCellLike
): RtlTextSegment[] {
  const segments: RtlTextSegment[] = []
  let activeSegment: RtlTextSegment | null = null
  const maxColumns =
    typeof columnCount === 'number' && Number.isFinite(columnCount) ? columnCount : line.length

  for (let column = 0; column < Math.min(line.length, maxColumns); column += 1) {
    const cell = line.getCell(column, nullCell)
    if (!cell || cell.getWidth() === 0) {
      continue
    }

    const text = cell.getChars() || ' '
    const style = resolveCellTextStyle(cell, rowStyle)
    if (activeSegment && rtlTextStylesMatch(activeSegment.style, style)) {
      activeSegment.text += text
      continue
    }

    activeSegment = { style, text }
    segments.push(activeSegment)
  }

  return trimTrailingDefaultBackgroundWhitespace(segments, rowStyle)
}

function trimTrailingDefaultBackgroundWhitespace(
  segments: RtlTextSegment[],
  rowStyle: RtlRowStyle
): RtlTextSegment[] {
  // Why: let xterm paint untouched trailing cells; trimming highlighted spaces
  // here would collapse non-default background runs and shift their visuals.
  const trimmed = [...segments]
  while (trimmed.length > 0) {
    const last = trimmed.at(-1)
    if (!last) {
      break
    }

    const nextText = last.text.replace(/\s+$/u, '')
    if (nextText.length === last.text.length) {
      break
    }

    last.text = nextText
    if (last.text.length > 0 || last.style.backgroundColor !== rowStyle.backgroundColor) {
      break
    }
    trimmed.pop()
  }

  return trimmed
}

function resolveCellTextStyle(cell: BufferCellLike, rowStyle: RtlRowStyle): RtlTextStyle {
  const inverse = cell.isInverse() !== 0
  let foregroundMode = cell.getFgColorMode()
  let foreground = cell.getFgColor()
  let backgroundMode = cell.getBgColorMode()
  let background = cell.getBgColor()

  if (inverse) {
    ;[foregroundMode, backgroundMode] = [backgroundMode, foregroundMode]
    ;[foreground, background] = [background, foreground]
  }

  if (
    cell.isBold() !== 0 &&
    rowStyle.drawBoldTextInBrightColors &&
    (foregroundMode === XTERM_COLOR_MODE_P16 || foregroundMode === XTERM_COLOR_MODE_P256) &&
    foreground >= 0 &&
    foreground < 8
  ) {
    foreground += 8
  }

  return {
    backgroundColor: resolveTerminalCellColor(
      backgroundMode,
      background,
      rowStyle.ansiPalette,
      inverse ? rowStyle.color : rowStyle.backgroundColor
    ),
    color:
      cell.isInvisible() !== 0
        ? 'transparent'
        : resolveTerminalCellColor(
            foregroundMode,
            foreground,
            rowStyle.ansiPalette,
            inverse ? rowStyle.backgroundColor : rowStyle.color
          ),
    fontStyle: cell.isItalic() !== 0 ? 'italic' : rowStyle.fontStyle,
    fontWeight: cell.isBold() !== 0 ? rowStyle.fontWeightBold : rowStyle.fontWeight,
    opacity: cell.isDim() !== 0 ? '0.5' : '1',
    textDecoration: resolveCellTextDecoration(cell)
  }
}

function resolveCellTextDecoration(cell: BufferCellLike): string {
  const decorations: string[] = []
  if (cell.isUnderline() !== 0) {
    decorations.push('underline')
  }
  if (cell.isStrikethrough() !== 0) {
    decorations.push('line-through')
  }
  return decorations.length === 0 ? 'none' : decorations.join(' ')
}

function rtlTextStylesMatch(left: RtlTextStyle, right: RtlTextStyle): boolean {
  return (
    left.backgroundColor === right.backgroundColor &&
    left.color === right.color &&
    left.fontStyle === right.fontStyle &&
    left.fontWeight === right.fontWeight &&
    left.opacity === right.opacity &&
    left.textDecoration === right.textDecoration
  )
}

function resolveAnsiPalette(theme: Terminal['options']['theme']): string[] {
  return resolveTerminalAnsiPalette(theme)
}

function resolveTerminalCellColor(
  colorMode: number,
  colorValue: number,
  ansiPalette: string[],
  defaultColor: string
): string {
  switch (colorMode) {
    case XTERM_COLOR_MODE_P16:
    case XTERM_COLOR_MODE_P256:
      return ansiPalette[colorValue] || defaultColor
    case XTERM_COLOR_MODE_RGB:
      return `#${colorValue.toString(16).padStart(6, '0')}`
    case XTERM_COLOR_MODE_DEFAULT:
    default:
      return defaultColor
  }
}

function resolveComputedBackground(style: CSSStyleDeclaration): string {
  return TRANSPARENT_COLORS.has(style.backgroundColor) ? 'inherit' : style.backgroundColor
}
