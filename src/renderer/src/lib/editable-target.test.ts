import { describe, expect, it } from 'vitest'
import { isEditableTarget } from './editable-target'

describe('isEditableTarget', () => {
  it('returns true for native form fields', () => {
    const input = document.createElement('input')
    const textarea = document.createElement('textarea')
    const select = document.createElement('select')

    expect(isEditableTarget(input)).toBe(true)
    expect(isEditableTarget(textarea)).toBe(true)
    expect(isEditableTarget(select)).toBe(true)
  })

  it('returns true for Monaco and rich markdown editor hosts', () => {
    const monaco = document.createElement('div')
    monaco.className = 'monaco-editor'
    const diffEditor = document.createElement('div')
    diffEditor.className = 'diff-editor'
    const richMarkdownEditor = document.createElement('div')
    richMarkdownEditor.className = 'rich-markdown-editor'

    expect(isEditableTarget(monaco)).toBe(true)
    expect(isEditableTarget(diffEditor)).toBe(true)
    expect(isEditableTarget(richMarkdownEditor)).toBe(true)
  })

  it('returns false for terminal helper textareas and non-editable surfaces', () => {
    const terminalHelper = document.createElement('textarea')
    terminalHelper.className = 'xterm-helper-textarea'
    const div = document.createElement('div')

    expect(isEditableTarget(terminalHelper)).toBe(false)
    expect(isEditableTarget(div)).toBe(false)
  })
})
