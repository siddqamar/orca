import { useLayoutEffect, type MutableRefObject } from 'react'
import {
  installRichMarkdownSaveShortcut,
  type RichMarkdownSaveShortcutContext
} from './rich-markdown-save-shortcut'

type UseRichMarkdownSaveShortcutOptions = RichMarkdownSaveShortcutContext & {
  rootRef: MutableRefObject<HTMLDivElement | null>
}

export function useRichMarkdownSaveShortcut({
  rootRef,
  editorRef,
  originalSourceRef,
  baseCanonicalRef,
  lastCommittedMarkdownRef,
  reconcileRoundTripRef,
  onContentChangeRef,
  onSaveRef,
  flushPendingSerialization
}: UseRichMarkdownSaveShortcutOptions): void {
  // Why: layout cleanup flushes serialization while Tiptap is still alive on tab or mode switches.
  useLayoutEffect(() => {
    const root = rootRef.current
    if (!root) {
      return
    }
    const cleanup = installRichMarkdownSaveShortcut(root, {
      editorRef,
      originalSourceRef,
      baseCanonicalRef,
      lastCommittedMarkdownRef,
      reconcileRoundTripRef,
      onContentChangeRef,
      onSaveRef,
      flushPendingSerialization
    })
    return () => {
      cleanup()
      flushPendingSerialization()
    }
  }, [
    rootRef,
    editorRef,
    originalSourceRef,
    baseCanonicalRef,
    lastCommittedMarkdownRef,
    reconcileRoundTripRef,
    onContentChangeRef,
    onSaveRef,
    flushPendingSerialization
  ])
}
