import { readFile, stat } from 'fs/promises'
import { basename, extname } from 'path'
import { PROMPT_PRESETS, type Settings } from '../shared/types'

/** Context files are pasted into the chat each time, so keep them reasonably small. */
export const MAX_CONTEXT_CHARS = 20000
export const CONTEXT_EXTENSIONS = ['md', 'txt', 'markdown', 'csv', 'json']

/** The text sent with a screenshot: a preset, or your own prompt plus the optional context file. */
export async function screenshotPrompt(s: Settings): Promise<string> {
  if (s.promptMode === 'none') return ''
  if (s.promptMode !== 'custom') return PROMPT_PRESETS.find((p) => p.id === s.promptMode)?.text ?? ''
  const base = s.customPrompt.trim()
  if (!s.contextFile) return base
  try {
    // Read on every ask so edits to context.md apply immediately.
    let context = (await readFile(s.contextFile.path, 'utf8')).trim()
    if (context.length > MAX_CONTEXT_CHARS) context = context.slice(0, MAX_CONTEXT_CHARS) + '\n…(truncated)'
    if (!context) return base
    return `${base}\n\nContext (${s.contextFile.name}):\n${context}`.trim()
  } catch {
    return base
  }
}

/** Validates a picked file and returns what we store in settings. */
export async function contextFileInfo(path: string): Promise<{ name: string; path: string }> {
  const ext = extname(path).slice(1).toLowerCase()
  if (!CONTEXT_EXTENSIONS.includes(ext)) throw new Error('Use a .md, .txt, .csv or .json file')
  const info = await stat(path)
  if (info.size > 2_000_000) throw new Error('File is too large (max 2 MB)')
  return { name: basename(path), path }
}
