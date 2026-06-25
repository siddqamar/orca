// Why: shared across global keyboard listeners (App-level shortcuts and the
// onboarding flow) so an in-progress text edit never gets hijacked by a
// capture-phase keydown handler.
export function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false
  }

  // xterm.js focuses a hidden <textarea class="xterm-helper-textarea"> for
  // keyboard input.  That element IS an editable target, but we must NOT
  // suppress global shortcuts when the terminal itself is focused.
  if (target.classList.contains('xterm-helper-textarea')) {
    return false
  }

  if (target.isContentEditable) {
    return true
  }

  // Why: Monaco and other embedded editors live inside host containers that
  // are not themselves form fields, so capture-phase global shortcuts must
  // treat those editor roots as editable too.
  return (
    target.closest(
      'input, textarea, select, [contenteditable=""], [contenteditable="true"], .monaco-editor, .diff-editor, .rich-markdown-editor, .rich-markdown-editor-shell'
    ) !== null
  )
}
