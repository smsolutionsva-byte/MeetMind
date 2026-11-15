/**
 * Meeting history: transcripts and API answers, saved as one JSON file per meeting in
 * userData/meetings. Nothing here leaves the PC; summaries and questions go to the AI only
 * when the user asks for them in Meeting notes.
 */
import { app } from 'electron'
import { mkdirSync, readdirSync, readFileSync, unlinkSync, writeFileSync } from 'fs'
import { join } from 'path'
import type { Meeting, MeetingAnswer, MeetingInfo } from '../shared/types'

/** Speech more than this long after the last line starts a new meeting. */
const MEETING_GAP_MS = 30 * 60_000
/** A meeting counts as "live" while something was heard this recently. */
const LIVE_MS = 2 * 60_000

const dir = () => join(app.getPath('userData'), 'meetings')
const fileOf = (id: string) => join(dir(), `${id}.json`)
const validId = (id: unknown): id is string => typeof id === 'string' && /^[\w-]{6,40}$/.test(id)

export class History {
  private meetings = new Map<string, Meeting>()
  private loaded = false
  private current: Meeting | null = null
  private timers = new Map<string, NodeJS.Timeout>()

  /** Called (throttled by the caller if needed) whenever a meeting is added to or changed. */
  constructor(private onChange: () => void) {}

  private load(): void {
    if (this.loaded) return
    this.loaded = true
    try {
      for (const f of readdirSync(dir())) {
        if (!f.endsWith('.json')) continue
        try {
          const m = JSON.parse(readFileSync(join(dir(), f), 'utf8')) as Meeting
          if (validId(m.id) && Array.isArray(m.lines)) {
            m.answers ??= []
            this.meetings.set(m.id, m)
          }
        } catch {
          // A damaged file shouldn't hide the rest.
        }
      }
    } catch {
      // No history yet.
    }
  }

  /** Debounced write of one meeting. */
  private save(m: Meeting): void {
    clearTimeout(this.timers.get(m.id))
    this.timers.set(
      m.id,
      setTimeout(() => {
        this.timers.delete(m.id)
        if (!this.meetings.has(m.id)) return // deleted meanwhile
        try {
          mkdirSync(dir(), { recursive: true })
          writeFileSync(fileOf(m.id), JSON.stringify(m))
        } catch (err) {
          console.error('[history] save failed', err)
        }
      }, 800)
    )
  }

  /** The meeting new lines belong to: the current one, or a new one after a long gap. */
  private meetingFor(at: number): Meeting {
    this.load()
    const c = this.current
    if (c && this.meetings.has(c.id) && at - c.endedAt < MEETING_GAP_MS) return c
    const d = new Date(at)
    const pad = (n: number) => String(n).padStart(2, '0')
    const id = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}-${Math.random().toString(36).slice(2, 6)}`
    const m: Meeting = { id, title: '', startedAt: at, endedAt: at, lines: [], answers: [] }
    this.meetings.set(id, m)
    this.current = m
    return m
  }

  addLine(text: string, at = Date.now()): void {
    const m = this.meetingFor(at)
    m.lines.push({ at, text })
    m.endedAt = at
    this.save(m)
    this.onChange()
  }

  addAnswer(answer: Omit<MeetingAnswer, 'at'>, at = Date.now()): void {
    if (!answer.text.trim()) return
    const m = this.meetingFor(at)
    m.answers.push({ ...answer, at })
    m.endedAt = Math.max(m.endedAt, at)
    this.save(m)
    this.onChange()
  }

  list(query = ''): MeetingInfo[] {
    this.load()
    const q = query.trim().toLowerCase()
    const now = Date.now()
    return [...this.meetings.values()]
      .filter((m) => !q || searchText(m).includes(q))
      .sort((a, b) => b.startedAt - a.startedAt)
      .map((m) => ({
        id: m.id,
        title: m.title,
        startedAt: m.startedAt,
        endedAt: m.endedAt,
        lineCount: m.lines.length,
        answerCount: m.answers.length,
        hasSummary: !!m.summary,
        preview: (m.lines[0]?.text ?? m.answers[0]?.question ?? '').slice(0, 120),
        live: m === this.current && now - m.endedAt < LIVE_MS
      }))
  }

  get(id: string): Meeting | null {
    this.load()
    return validId(id) ? (this.meetings.get(id) ?? null) : null
  }

  rename(id: string, title: string): void {
    const m = this.get(id)
    if (!m) return
    m.title = title.trim().slice(0, 120)
    this.save(m)
    this.onChange()
  }

  setSummary(id: string, summary: string): void {
    const m = this.get(id)
    if (!m) return
    // The summary prompt asks for "Title: …" on the first line; use it unless the user named it.
    const match = summary.match(/^\s*\**title:?\**\s*:?\s*(.+)\n+/i)
    if (match) {
      if (!m.title) m.title = match[1].replace(/\*+/g, '').trim().slice(0, 120)
      summary = summary.slice(match[0].length)
    }
    m.summary = summary.trim()
    m.summaryAt = Date.now()
    this.save(m)
    this.onChange()
  }

  remove(id: string): void {
    const m = this.get(id)
    if (!m) return
    this.meetings.delete(id)
    clearTimeout(this.timers.get(id))
    if (this.current === m) this.current = null
    try {
      unlinkSync(fileOf(id))
    } catch {
      // Never saved yet.
    }
    this.onChange()
  }

  removeAll(): void {
    this.load()
    for (const id of [...this.meetings.keys()]) this.remove(id)
  }

  /**
   * Text for the AI: one meeting, or (for "all meetings") the ones that best match the
   * question, newest first, until the size budget is used.
   */
  context(meetingId: string | null, question: string, budget = 60_000): string {
    this.load()
    let picked: Meeting[]
    if (meetingId) {
      const m = this.get(meetingId)
      picked = m ? [m] : []
    } else {
      const words = question.toLowerCase().match(/[\p{L}\p{N}]{4,}/gu) ?? []
      const score = (m: Meeting) => {
        const t = searchText(m)
        return words.reduce((n, w) => n + (t.includes(w) ? 1 : 0), 0)
      }
      picked = [...this.meetings.values()]
        .map((m) => ({ m, s: score(m) }))
        .sort((a, b) => b.s - a.s || b.m.startedAt - a.m.startedAt)
        .map((x) => x.m)
    }
    const parts: string[] = []
    let used = 0
    for (const m of picked) {
      let block = formatMeeting(m, !meetingId)
      if (used + block.length > budget) {
        if (parts.length) break
        // A single very long meeting: keep the start and the end.
        const half = Math.floor(budget / 2)
        block = `${block.slice(0, half)}\n[… middle of the transcript left out …]\n${block.slice(-half)}`
      }
      parts.push(block)
      used += block.length
    }
    return parts.join('\n\n')
  }
}

function searchText(m: Meeting): string {
  return [m.title, m.summary ?? '', ...m.lines.map((l) => l.text), ...m.answers.map((a) => a.question)]
    .join('\n')
    .toLowerCase()
}

const time = (at: number) => new Date(at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

export function meetingLabel(m: { title: string; startedAt: number }): string {
  const d = new Date(m.startedAt)
  const date = d.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
  return `${m.title || 'Meeting'} (${date}, ${time(m.startedAt)})`
}

/** Plain-text transcript for the AI. With a saved summary, "all meetings" mode uses it too. */
function formatMeeting(m: Meeting, preferSummary: boolean): string {
  const head = `=== ${meetingLabel(m)} ===`
  const summary = m.summary ? `Summary:\n${m.summary}\n` : ''
  const lines = m.lines.map((l) => `[${time(l.at)}] ${l.text}`).join('\n')
  if (preferSummary && m.summary && lines.length > 8000) return `${head}\n${summary}`
  return `${head}\n${summary}${summary ? '\nTranscript:\n' : ''}${lines || '(no transcript)'}`
}
