import type { IDisposable, Terminal } from '@xterm/xterm'
import {
  renderTerminalRtlOverlayRow,
  resolveTerminalRtlRowStyle,
  type BufferCellLike,
  type BufferLineLike
} from './terminal-rtl-overlay-row-content'

type BufferLike = {
  viewportY: number
  getNullCell(): BufferCellLike
  getLine(y: number): BufferLineLike | undefined
}

export type TerminalRtlOverlayRow = {
  bufferLine: number
  text: string
  visualRow: number
}

export type TerminalRtlOverlayModel = {
  buffer: {
    active: BufferLike
  }
  rows: number
}

const RTL_SCRIPT_RE = /[\u0590-\u08ff\ufb50-\ufdff\ufe70-\ufeff]/u

export function terminalLineNeedsRtlOverlay(text: string): boolean {
  return RTL_SCRIPT_RE.test(text)
}

export function collectVisibleTerminalRtlRows(
  terminal: TerminalRtlOverlayModel
): TerminalRtlOverlayRow[] {
  const rows: TerminalRtlOverlayRow[] = []
  const buffer = terminal.buffer.active

  for (let visualRow = 0; visualRow < terminal.rows; visualRow += 1) {
    const bufferLine = buffer.viewportY + visualRow
    const line = buffer.getLine(bufferLine)
    const text = line?.translateToString(true) ?? ''
    if (text && terminalLineNeedsRtlOverlay(text)) {
      rows.push({ bufferLine, text, visualRow })
    }
  }

  return rows
}

export function attachTerminalRtlOverlay(
  terminal: Terminal,
  xtermContainer: HTMLElement
): () => void {
  // Why: xterm's cell renderers keep PTY data correct but cannot shape Arabic
  // or apply BiDi ordering; browser text can do that without mutating the buffer.
  const overlay = document.createElement('div')
  overlay.className = 'orca-terminal-rtl-overlay'
  overlay.hidden = true
  xtermContainer.appendChild(overlay)

  let disposed = false
  let pendingRafId: number | null = null
  const disposables: IDisposable[] = []

  const resizeObserver =
    typeof ResizeObserver === 'undefined'
      ? null
      : new ResizeObserver(() => {
          scheduleRender()
        })

  const render = (): void => {
    pendingRafId = null
    if (disposed || terminal.hasSelection()) {
      clearOverlay(overlay)
      return
    }

    const screenElement = terminal.element?.querySelector<HTMLElement>('.xterm-screen')
    if (!screenElement) {
      clearOverlay(overlay)
      return
    }

    const containerRect = xtermContainer.getBoundingClientRect()
    const screenRect = screenElement.getBoundingClientRect()
    const cellHeight = screenRect.height / terminal.rows
    if (!(cellHeight > 0) || !(screenRect.width > 0)) {
      clearOverlay(overlay)
      return
    }

    const rows = collectVisibleTerminalRtlRows(terminal)
    if (rows.length === 0) {
      clearOverlay(overlay)
      return
    }

    syncOverlayGeometry(overlay, containerRect, screenRect)
    syncOverlayRows(overlay, rows, terminal, screenElement, cellHeight)
    overlay.hidden = false
  }

  const scheduleRender = (): void => {
    if (disposed || pendingRafId != null) {
      return
    }
    pendingRafId = requestAnimationFrame(render)
  }

  disposables.push(
    terminal.onRender(scheduleRender),
    terminal.onWriteParsed(scheduleRender),
    terminal.onScroll(scheduleRender),
    terminal.onResize(scheduleRender),
    terminal.onSelectionChange(scheduleRender)
  )

  if (resizeObserver) {
    resizeObserver.observe(xtermContainer)
  }
  scheduleRender()

  return () => {
    disposed = true
    if (pendingRafId != null) {
      cancelAnimationFrame(pendingRafId)
      pendingRafId = null
    }
    for (const disposable of disposables) {
      disposable.dispose()
    }
    resizeObserver?.disconnect()
    overlay.remove()
  }
}

function clearOverlay(overlay: HTMLElement): void {
  overlay.hidden = true
  overlay.replaceChildren()
}

function syncOverlayGeometry(
  overlay: HTMLElement,
  containerRect: DOMRect,
  screenRect: DOMRect
): void {
  overlay.style.left = `${screenRect.left - containerRect.left}px`
  overlay.style.top = `${screenRect.top - containerRect.top}px`
  overlay.style.width = `${screenRect.width}px`
  overlay.style.height = `${screenRect.height}px`
}

function syncOverlayRows(
  overlay: HTMLElement,
  rows: TerminalRtlOverlayRow[],
  terminal: Terminal,
  screenElement: HTMLElement,
  cellHeight: number
): void {
  const fragment = document.createDocumentFragment()
  const rowStyle = resolveTerminalRtlRowStyle(terminal, screenElement)
  const nullCell = terminal.buffer.active.getNullCell()

  for (const row of rows) {
    const rowElement = document.createElement('div')
    rowElement.className = 'orca-terminal-rtl-overlay-row'
    rowElement.dataset.bufferLine = String(row.bufferLine)
    rowElement.style.top = `${row.visualRow * cellHeight}px`
    rowElement.style.height = `${cellHeight}px`
    rowElement.style.lineHeight = `${cellHeight}px`
    rowElement.style.fontFamily = rowStyle.fontFamily
    rowElement.style.fontSize = rowStyle.fontSize
    rowElement.style.fontWeight = rowStyle.fontWeight
    rowElement.style.fontStyle = rowStyle.fontStyle
    rowElement.style.letterSpacing = rowStyle.letterSpacing
    rowElement.style.color = rowStyle.color
    rowElement.style.backgroundColor = rowStyle.backgroundColor
    renderTerminalRtlOverlayRow(rowElement, row, terminal, rowStyle, nullCell)
    fragment.appendChild(rowElement)
  }

  overlay.replaceChildren(fragment)
}
