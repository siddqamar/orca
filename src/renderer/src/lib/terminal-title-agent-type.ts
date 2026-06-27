import { getAgentLabel, titleHasAgentName } from '../../../shared/agent-detection'
import type { TuiAgent } from '../../../shared/types'

const TITLE_LABEL_TO_AGENT: Partial<Record<string, TuiAgent>> = {
  'Claude Code': 'claude',
  OpenClaude: 'openclaude',
  Codex: 'codex',
  'Gemini CLI': 'gemini',
  'GitHub Copilot': 'copilot',
  Grok: 'grok',
  Devin: 'devin',
  Antigravity: 'antigravity',
  OpenCode: 'opencode',
  'MiMo Code': 'mimo-code',
  Aider: 'aider',
  Cursor: 'cursor',
  Droid: 'droid',
  Hermes: 'hermes',
  Pi: 'pi'
}

function containsBrailleSpinner(title: string): boolean {
  for (const char of title) {
    const codePoint = char.codePointAt(0)
    if (codePoint !== undefined && codePoint >= 0x2800 && codePoint <= 0x28ff) {
      return true
    }
  }
  return false
}

function hasGenericClaudeStatusPrefix(title: string): boolean {
  return (
    containsBrailleSpinner(title) ||
    title.startsWith('\u2733 ') ||
    title === '\u2733' ||
    title.startsWith('. ') ||
    title.startsWith('* ')
  )
}

function isGenericClaudeStatusClaim(title: string, titleAgent: TuiAgent | null): boolean {
  return (
    titleAgent === 'claude' &&
    hasGenericClaudeStatusPrefix(title) &&
    !titleHasAgentName(title, 'claude')
  )
}

export function resolveTerminalTitleAgentType(title: string): TuiAgent | null {
  const label = getAgentLabel(title)
  return label ? (TITLE_LABEL_TO_AGENT[label] ?? null) : null
}

export function resolveExplicitTerminalTitleAgentType(title: string): TuiAgent | null {
  const titleAgent = resolveTerminalTitleAgentType(title)
  if (isGenericClaudeStatusClaim(title, titleAgent)) {
    // Why: Claude's task-title spinner can describe arbitrary work. Treat it
    // as activity-only unless the title explicitly names Claude.
    return null
  }
  return titleAgent
}
