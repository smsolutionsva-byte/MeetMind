/** Always-listening mode helpers: clean up Whisper output and decide when to answer. */

export interface TranscriptLine {
  text: string
  at: number
}

/** Whisper invents these on silence or music; never treat them as speech. */
const HALLUCINATIONS = new Set([
  'you', 'thank you.', 'thank you', 'thanks for watching!', 'thanks for watching.',
  'bye.', 'bye', '.', '...', 'okay.', 'so', 'uh', 'um'
])

export function cleanTranscript(text: string): string {
  const t = text.replace(/\s+/g, ' ').trim()
  if (!t || /^[[(].*[\])]$/.test(t)) return ''
  if (HALLUCINATIONS.has(t.toLowerCase())) return ''
  return t
}

const QUESTION_START =
  /^(so,?\s+)?(what|why|how|when|where|who|whom|which|whose|can|could|would|will|should|shall|do|does|did|is|are|was|were|have|has|any thoughts|explain|tell me|walk me|give me|thoughts)\b/i

export function isQuestion(text: string): boolean {
  const t = text.trim()
  if (t.split(/\s+/).length < 3) return false
  return /\?\s*["')]?$/.test(t) || QUESTION_START.test(t)
}

export function mentionsName(text: string, name: string): boolean {
  const n = name.trim()
  if (!n) return false
  const escaped = n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`\\b${escaped}\\b`, 'i').test(text)
}

/**
 * Should the newest line trigger an answer?
 * "questions": any question. "name": your name was said in this line or the previous one
 * (people often say the name, pause, then ask).
 */
export function shouldAnswer(
  lines: TranscriptLine[],
  trigger: 'questions' | 'name',
  myName: string
): boolean {
  const last = lines[lines.length - 1]
  if (!last) return false
  if (trigger === 'questions') return isQuestion(last.text)
  const prev = lines[lines.length - 2]
  const recentPrev = prev && last.at - prev.at < 15000 ? prev : undefined
  return mentionsName(last.text, myName) || (!!recentPrev && mentionsName(recentPrev.text, myName))
}
