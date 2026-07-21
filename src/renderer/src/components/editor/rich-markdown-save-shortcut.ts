import type { KeyHandlerContext } from './rich-markdown-key-handler'
import { editorShortcutMatches } from './editor-shortcuts'
import { commitRichMarkdownSerialization } from './rich-markdown-serialization-commit'

export type RichMarkdownSaveShortcutContext = Pick<
  KeyHandlerContext,
  | 'editorRef'
  | 'originalSourceRef'
  | 'baseCanonicalRef'
  | 'lastCommittedMarkdownRef'
  | 'reconcileRoundTripRef'
  | 'onContentChangeRef'
  | 'onSaveRef'
  | 'flushPendingSerialization'
>

/**
 * Cmd/Ctrl+S: flush the debounced serialization, then reconcile toward the
 * original source style before saving so untouched regions keep their bytes.
 */
export function handleRichMarkdownSaveShortcut(
  ctx: RichMarkdownSaveShortcutContext,
  event: KeyboardEvent
): boolean {
  if (!editorShortcutMatches('editor.save', event)) {
    return false
  }
  event.preventDefault()
  // Why: flush pending debounced serialization so the save captures the very
  // latest editor content, not a stale snapshot.
  ctx.flushPendingSerialization()
  // Why: the flush already reconciled + updated refs, so this re-serialize is
  // idempotent (edited === baseCanonical → returns the reconciled bytes). On a
  // torn-down editor it falls back to the last committed bytes without patching.
  const { markdown } = commitRichMarkdownSerialization(
    ctx.editorRef.current,
    ctx,
    ctx.reconcileRoundTripRef.current
  )
  ctx.onContentChangeRef.current(markdown)
  ctx.onSaveRef.current(markdown)
  return true
}

export function installRichMarkdownSaveShortcut(
  target: HTMLElement,
  context: RichMarkdownSaveShortcutContext
): () => void {
  const handleKeyDown = (event: KeyboardEvent): void => {
    if (event.repeat || !editorShortcutMatches('editor.save', event)) {
      return
    }
    // Why: capture the shortcut at the editor surface so toolbar and NodeView focus cannot bypass the rich editor save path.
    event.preventDefault()
    event.stopPropagation()
    handleRichMarkdownSaveShortcut(context, event)
  }

  target.addEventListener('keydown', handleKeyDown, true)
  return () => target.removeEventListener('keydown', handleKeyDown, true)
}
