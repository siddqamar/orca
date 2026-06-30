// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Terminal } from '@xterm/xterm'
import {
  attachTerminalRtlOverlay,
  collectVisibleTerminalRtlRows,
  terminalLineNeedsRtlOverlay
} from './terminal-rtl-overlay'

type Listener = () => void

function createTerminalEvent() {
  const listeners = new Set<Listener>()
  return {
    event: vi.fn((listener: Listener) => {
      listeners.add(listener)
      return {
        dispose: vi.fn(() => {
          listeners.delete(listener)
        })
      }
    }),
    emit: () => {
      for (const listener of listeners) {
        listener()
      }
    },
    listenerCount: () => listeners.size
  }
}

function createRect(left: number, top: number, width: number, height: number): DOMRect {
  return {
    bottom: top + height,
    height,
    left,
    right: left + width,
    toJSON: () => ({}),
    top,
    width,
    x: left,
    y: top
  }
}

function setElementRect(element: HTMLElement, rect: DOMRect): void {
  element.getBoundingClientRect = () => rect
}

describe('terminal RTL overlay', () => {
  let nextRafId = 1
  let pendingRafs = new Map<number, FrameRequestCallback>()

  beforeEach(() => {
    nextRafId = 1
    pendingRafs = new Map()
    vi.stubGlobal(
      'requestAnimationFrame',
      vi.fn((callback: FrameRequestCallback) => {
        const id = nextRafId
        nextRafId += 1
        pendingRafs.set(id, callback)
        return id
      })
    )
    vi.stubGlobal(
      'cancelAnimationFrame',
      vi.fn((id: number) => {
        pendingRafs.delete(id)
      })
    )
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  function flushAnimationFrames(): void {
    const callbacks = Array.from(pendingRafs.values())
    pendingRafs = new Map()
    for (const callback of callbacks) {
      callback(16)
    }
  }

  it('detects Arabic and related RTL text only when needed', () => {
    expect(terminalLineNeedsRtlOverlay('plain ascii')).toBe(false)
    expect(terminalLineNeedsRtlOverlay('build \u0645\u0631\u062d\u0628\u0627')).toBe(true)
    expect(terminalLineNeedsRtlOverlay('\u05e9\u05dc\u05d5\u05dd')).toBe(true)
  })

  it('collects visible buffer rows that need browser BiDi shaping', () => {
    const lines = new Map([
      [4, 'ascii only'],
      [5, '\u0645\u0631\u062d\u0628\u0627 \u0645\u0646 \u0627\u0648\u0631\u0643\u0627'],
      [6, 'done']
    ])

    const rows = collectVisibleTerminalRtlRows({
      rows: 3,
      buffer: {
        active: {
          viewportY: 4,
          getLine: (line) => ({
            translateToString: () => lines.get(line) ?? ''
          })
        }
      }
    })

    expect(rows).toEqual([
      {
        bufferLine: 5,
        text: '\u0645\u0631\u062d\u0628\u0627 \u0645\u0646 \u0627\u0648\u0631\u0643\u0627',
        visualRow: 1
      }
    ])
  })

  it('renders RTL rows over the xterm screen without changing terminal data', () => {
    const renderEvent = createTerminalEvent()
    const writeParsedEvent = createTerminalEvent()
    const scrollEvent = createTerminalEvent()
    const resizeEvent = createTerminalEvent()
    const selectionEvent = createTerminalEvent()
    const xtermContainer = document.createElement('div')
    const terminalElement = document.createElement('div')
    const screenElement = document.createElement('div')
    screenElement.className = 'xterm-screen'
    terminalElement.appendChild(screenElement)
    xtermContainer.appendChild(terminalElement)
    document.body.appendChild(xtermContainer)
    setElementRect(xtermContainer, createRect(10, 20, 900, 500))
    setElementRect(screenElement, createRect(14, 26, 800, 60))

    const terminal = {
      buffer: {
        active: {
          viewportY: 2,
          getLine: (line: number) => ({
            translateToString: () =>
              line === 3 ? 'prompt> \u0645\u0631\u062d\u0628\u0627' : 'ascii'
          })
        }
      },
      element: terminalElement,
      hasSelection: vi.fn(() => false),
      onRender: renderEvent.event,
      onResize: resizeEvent.event,
      onScroll: scrollEvent.event,
      onSelectionChange: selectionEvent.event,
      onWriteParsed: writeParsedEvent.event,
      options: {
        fontFamily: 'Consolas',
        fontSize: 14,
        fontWeight: '300',
        letterSpacing: 1,
        theme: {
          background: '#111111',
          foreground: '#eeeeee'
        }
      },
      rows: 3
    } as unknown as Terminal

    const cleanup = attachTerminalRtlOverlay(terminal, xtermContainer)
    flushAnimationFrames()

    const overlay = xtermContainer.querySelector<HTMLElement>('.orca-terminal-rtl-overlay')
    const row = overlay?.querySelector<HTMLElement>('.orca-terminal-rtl-overlay-row')
    expect(overlay?.hidden).toBe(false)
    expect(overlay?.style.left).toBe('4px')
    expect(overlay?.style.top).toBe('6px')
    expect(overlay?.style.width).toBe('800px')
    expect(overlay?.style.height).toBe('60px')
    expect(row?.dataset.bufferLine).toBe('3')
    expect(row?.textContent).toBe('prompt> \u0645\u0631\u062d\u0628\u0627')
    expect(row?.style.top).toBe('20px')
    expect(row?.style.height).toBe('20px')
    expect(row?.style.fontFamily).toBe('Consolas')
    expect(row?.style.fontSize).toBe('14px')
    expect(row?.style.fontWeight).toBe('300')
    expect(row?.style.letterSpacing).toBe('1px')
    expect(row?.style.color).toBe('#eeeeee')
    expect(row?.style.backgroundColor).toBe('#111111')

    cleanup()
  })

  it('hides while xterm owns a selection', () => {
    const selectionEvent = createTerminalEvent()
    const xtermContainer = document.createElement('div')
    const terminalElement = document.createElement('div')
    const screenElement = document.createElement('div')
    screenElement.className = 'xterm-screen'
    terminalElement.appendChild(screenElement)
    xtermContainer.appendChild(terminalElement)
    document.body.appendChild(xtermContainer)
    setElementRect(xtermContainer, createRect(0, 0, 200, 40))
    setElementRect(screenElement, createRect(0, 0, 200, 40))

    const terminal = {
      buffer: {
        active: {
          viewportY: 0,
          getLine: () => ({
            translateToString: () => '\u0645\u0631\u062d\u0628\u0627'
          })
        }
      },
      element: terminalElement,
      hasSelection: vi.fn(() => false),
      onRender: createTerminalEvent().event,
      onResize: createTerminalEvent().event,
      onScroll: createTerminalEvent().event,
      onSelectionChange: selectionEvent.event,
      onWriteParsed: createTerminalEvent().event,
      options: {},
      rows: 1
    } as unknown as Terminal

    const cleanup = attachTerminalRtlOverlay(terminal, xtermContainer)
    flushAnimationFrames()
    const overlay = xtermContainer.querySelector<HTMLElement>('.orca-terminal-rtl-overlay')
    expect(overlay?.hidden).toBe(false)

    vi.mocked(terminal.hasSelection).mockReturnValue(true)
    selectionEvent.emit()
    flushAnimationFrames()

    expect(overlay?.hidden).toBe(true)
    expect(overlay?.childElementCount).toBe(0)
    cleanup()
  })

  it('disposes listeners, pending render work, and overlay DOM', () => {
    const renderEvent = createTerminalEvent()
    const writeParsedEvent = createTerminalEvent()
    const scrollEvent = createTerminalEvent()
    const resizeEvent = createTerminalEvent()
    const selectionEvent = createTerminalEvent()
    const xtermContainer = document.createElement('div')
    const terminal = {
      buffer: {
        active: {
          viewportY: 0,
          getLine: () => undefined
        }
      },
      element: null,
      hasSelection: vi.fn(() => false),
      onRender: renderEvent.event,
      onResize: resizeEvent.event,
      onScroll: scrollEvent.event,
      onSelectionChange: selectionEvent.event,
      onWriteParsed: writeParsedEvent.event,
      options: {},
      rows: 1
    } as unknown as Terminal

    const cleanup = attachTerminalRtlOverlay(terminal, xtermContainer)
    expect(xtermContainer.querySelector('.orca-terminal-rtl-overlay')).not.toBeNull()
    expect(renderEvent.listenerCount()).toBe(1)

    cleanup()

    expect(cancelAnimationFrame).toHaveBeenCalledWith(1)
    expect(xtermContainer.querySelector('.orca-terminal-rtl-overlay')).toBeNull()
    expect(renderEvent.listenerCount()).toBe(0)
    expect(writeParsedEvent.listenerCount()).toBe(0)
    expect(scrollEvent.listenerCount()).toBe(0)
    expect(resizeEvent.listenerCount()).toBe(0)
    expect(selectionEvent.listenerCount()).toBe(0)
  })
})
