import { afterEach, describe, expect, it, vi } from 'vitest'
import { isEditableTarget } from './editable-target'

class MockHTMLElement {
  isContentEditable: boolean
  className: string
  classList: { contains: (token: string) => boolean }
  private readonly closestMatches: string[]

  constructor(options: { className?: string; closestMatches?: string[]; isContentEditable?: boolean }) {
    this.className = options.className ?? ''
    this.closestMatches = options.closestMatches ?? []
    this.isContentEditable = options.isContentEditable ?? false
    this.classList = {
      contains: (token: string) => this.className.split(' ').includes(token)
    }
  }

  closest(selector: string): Record<string, never> | null {
    const selectorMatchesClass = this.className
      .split(' ')
      .filter(Boolean)
      .some((className) => selector.includes(`.${className}`))
    return selectorMatchesClass || this.closestMatches.some((match) => selector.includes(match))
      ? {}
      : null
  }
}

function makeTarget(options: {
  className?: string
  closestMatches?: string[]
  isContentEditable?: boolean
}): MockHTMLElement {
  return new MockHTMLElement(options)
}

describe('isEditableTarget', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('returns true for native form fields', () => {
    vi.stubGlobal('HTMLElement', MockHTMLElement)

    expect(
      isEditableTarget(
        makeTarget({
          closestMatches: ['input']
        }) as unknown as EventTarget
      )
    ).toBe(true)
    expect(
      isEditableTarget(
        makeTarget({
          closestMatches: ['textarea']
        }) as unknown as EventTarget
      )
    ).toBe(true)
    expect(
      isEditableTarget(
        makeTarget({
          closestMatches: ['select']
        }) as unknown as EventTarget
      )
    ).toBe(true)
  })

  it('returns true for Monaco and rich markdown editor hosts', () => {
    vi.stubGlobal('HTMLElement', MockHTMLElement)

    expect(
      isEditableTarget(
        makeTarget({
          className: 'monaco-editor',
          closestMatches: ['.monaco-editor']
        }) as unknown as EventTarget
      )
    ).toBe(true)
    expect(
      isEditableTarget(
        makeTarget({
          className: 'diff-editor',
          closestMatches: ['.diff-editor']
        }) as unknown as EventTarget
      )
    ).toBe(true)
    expect(
      isEditableTarget(
        makeTarget({
          className: 'rich-markdown-editor',
          closestMatches: ['.rich-markdown-editor']
        }) as unknown as EventTarget
      )
    ).toBe(true)
    expect(
      isEditableTarget(
        makeTarget({
          className: 'rich-markdown-editor-shell',
          closestMatches: ['.rich-markdown-editor-shell']
        }) as unknown as EventTarget
      )
    ).toBe(true)
  })

  it('returns false for terminal helper textareas and non-editable surfaces', () => {
    vi.stubGlobal('HTMLElement', MockHTMLElement)

    expect(
      isEditableTarget(
        makeTarget({
          className: 'xterm-helper-textarea',
          closestMatches: ['textarea']
        }) as unknown as EventTarget
      )
    ).toBe(false)
    expect(isEditableTarget(makeTarget({}) as unknown as EventTarget)).toBe(false)
  })
})
