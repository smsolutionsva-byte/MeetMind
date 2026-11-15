import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { API_PROVIDERS, PROVIDERS, type AppState, type Meeting, type MeetingInfo, type NotesAnswer } from '../../../shared/types'
import { Markdown } from './Markdown'

const api = window.meetmind

/** One question (or summary request) and where its answer is. */
interface Ask {
  key: number
  question: string
  requestId?: number
  /** Web mode: the name of the AI tab it was pasted into. */
  web?: string
  error?: string
}

type View = { kind: 'meeting'; id: string } | { kind: 'all' }

const EXAMPLES = [
  'What are my open action items?',
  'What did we decide about the budget?',
  'Explain the jargon that came up this week',
  'Summarize everything from yesterday'
]

export function Notes() {
  const [state, setState] = useState<AppState | null>(null)
  const [query, setQuery] = useState('')
  const [list, setList] = useState<MeetingInfo[] | null>(null)
  const [view, setView] = useState<View | null>(null)
  const [meeting, setMeeting] = useState<Meeting | null>(null)
  const [tab, setTab] = useState<'transcript' | 'answers'>('transcript')
  const [answers, setAnswers] = useState<Record<number, NotesAnswer>>({})
  /** Questions per view ("all" or a meeting id), kept while the window is open. */
  const [threads, setThreads] = useState<Record<string, Ask[]>>({})
  /** Summary in progress per meeting. */
  const [summaries, setSummaries] = useState<Record<string, Ask>>({})
  const nextKey = useRef(1)

  useEffect(() => {
    void api.getState().then(setState)
    const offState = api.onState(setState)
    const offAnswer = api.onNotesAnswer((a) => setAnswers((m) => ({ ...m, [a.requestId]: a })))
    return () => {
      offState()
      offAnswer()
    }
  }, [])

  const refreshList = useCallback(() => {
    void api.listMeetings(query).then(setList)
  }, [query])

  useEffect(() => {
    const t = setTimeout(refreshList, 150)
    return () => clearTimeout(t)
  }, [refreshList])

  const meetingId = view?.kind === 'meeting' ? view.id : null
  const refreshMeeting = useCallback(() => {
    if (meetingId) void api.getMeeting(meetingId).then(setMeeting)
    else setMeeting(null)
  }, [meetingId])
  useEffect(refreshMeeting, [refreshMeeting])

  useEffect(
    () =>
      api.onHistoryChanged(() => {
        refreshList()
        refreshMeeting()
      }),
    [refreshList, refreshMeeting]
  )

  // Open the newest meeting first; fall back to "all meetings" if the open one disappears.
  useEffect(() => {
    if (!list) return
    if (!view && !query) setView(list[0] ? { kind: 'meeting', id: list[0].id } : { kind: 'all' })
  }, [list, view, query])
  useEffect(() => {
    if (meetingId && list && !query && !list.some((m) => m.id === meetingId))
      setView(list[0] ? { kind: 'meeting', id: list[0].id } : { kind: 'all' })
  }, [list, meetingId, query])

  if (!state || !list) return <div className="notes" />
  const settings = state.settings
  const apiMode = settings.answerSource === 'api'
  const answeredBy = apiMode
    ? `${API_PROVIDERS.find((p) => p.id === settings.apiProvider)!.name} API`
    : `your ${PROVIDERS.find((p) => p.id === settings.active)!.name} tab`
  const threadKey = meetingId ?? 'all'
  const thread = threads[threadKey] ?? []

  const ask = async (question: string) => {
    const q = question.trim()
    if (!q) return
    const res = await api.notesAsk({ meetingId, kind: 'question', question: q })
    const entry: Ask = { key: nextKey.current++, question: q }
    if (res.mode === 'api') entry.requestId = res.requestId
    else if (res.mode === 'web') entry.web = res.tab
    else entry.error = res.message
    setThreads((t) => ({ ...t, [threadKey]: [...(t[threadKey] ?? []), entry] }))
  }

  const summarize = async (id: string) => {
    const res = await api.notesAsk({ meetingId: id, kind: 'summary', question: '' })
    const entry: Ask = { key: nextKey.current++, question: 'Summary' }
    if (res.mode === 'api') entry.requestId = res.requestId
    else if (res.mode === 'web') entry.web = res.tab
    else entry.error = res.message
    setSummaries((s) => ({ ...s, [id]: entry }))
  }

  return (
    <div className="notes">
      <header className="notes-titlebar">
        <span className="dot" />
        <span>MeetMind Notes</span>
        <span className="notes-private">
          <LockIcon /> Saved on this PC only
        </span>
      </header>

      <div className="notes-body">
        <aside className="notes-side">
          <div className="notes-search">
            <SearchIcon />
            <input value={query} placeholder="Search meetings" onChange={(e) => setQuery(e.target.value)} />
            {query && (
              <button className="notes-clear" title="Clear search" onClick={() => setQuery('')}>
                ×
              </button>
            )}
          </div>

          <button
            className={`notes-all ${view?.kind === 'all' ? 'on' : ''}`}
            onClick={() => setView({ kind: 'all' })}
          >
            <SparkIcon /> Ask all meetings
          </button>

          <div className="notes-list">
            {groupByDay(list).map(([day, items]) => (
              <div key={day}>
                <div className="notes-day">{day}</div>
                {items.map((m) => (
                  <button
                    key={m.id}
                    className={`notes-item ${meetingId === m.id ? 'on' : ''}`}
                    onClick={() => setView({ kind: 'meeting', id: m.id })}
                  >
                    <span className="notes-item-title">
                      {m.live && <span className="live-dot" title="Recording now" />}
                      {titleOf(m)}
                    </span>
                    <span className="notes-item-meta">
                      {clock(m.startedAt)} · {duration(m)} · {m.lineCount} {m.lineCount === 1 ? 'line' : 'lines'}
                      {m.hasSummary && <span className="notes-chip">Summary</span>}
                    </span>
                  </button>
                ))}
              </div>
            ))}
            {!list.length && <p className="notes-none">{query ? 'No meetings match.' : 'No meetings yet.'}</p>}
          </div>

          <SideFooter saving={settings.saveHistory} count={list.length} filtered={!!query} />
        </aside>

        <main className="notes-main">
          {view?.kind === 'meeting' && meeting ? (
            <MeetingView
              key={meeting.id}
              meeting={meeting}
              live={list.find((m) => m.id === meeting.id)?.live ?? false}
              query={query}
              tab={tab}
              setTab={setTab}
              summary={summaries[meeting.id]}
              summaryAnswer={answerFor(summaries[meeting.id], answers)}
              onSummarize={() => void summarize(meeting.id)}
              apiMode={apiMode}
            >
              <AskPanel
                thread={thread}
                answers={answers}
                answeredBy={answeredBy}
                placeholder="Ask about this meeting…"
                onAsk={ask}
                onClear={() => setThreads((t) => ({ ...t, [threadKey]: [] }))}
              />
            </MeetingView>
          ) : view?.kind === 'all' || (!list.length && !query) ? (
            <AllView empty={!list.length} saving={settings.saveHistory} thread={thread} onAsk={ask}>
              <AskPanel
                thread={thread}
                answers={answers}
                answeredBy={answeredBy}
                placeholder={list.length ? 'Ask anything about your meetings…' : 'Nothing to ask about yet'}
                disabled={!list.length}
                onAsk={ask}
                onClear={() => setThreads((t) => ({ ...t, [threadKey]: [] }))}
              />
            </AllView>
          ) : (
            <div className="notes-placeholder">Pick a meeting</div>
          )}
        </main>
      </div>
    </div>
  )
}

function answerFor(a: Ask | undefined, answers: Record<number, NotesAnswer>): NotesAnswer | undefined {
  return a?.requestId ? answers[a.requestId] : undefined
}

// ---- One meeting ----

function MeetingView({
  meeting,
  live,
  query,
  tab,
  setTab,
  summary,
  summaryAnswer,
  onSummarize,
  apiMode,
  children
}: {
  meeting: Meeting
  live: boolean
  query: string
  tab: 'transcript' | 'answers'
  setTab: (t: 'transcript' | 'answers') => void
  summary?: Ask
  summaryAnswer?: NotesAnswer
  onSummarize: () => void
  apiMode: boolean
  children: ReactNode
}) {
  const [editing, setEditing] = useState(false)
  const [title, setTitle] = useState(meeting.title)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [copied, setCopied] = useState(false)
  useEffect(() => setTitle(meeting.title), [meeting.title])

  const streaming = summaryAnswer && !summaryAnswer.done
  const showStreamed = summaryAnswer && (!summaryAnswer.done || summaryAnswer.error)

  const saveTitle = () => {
    setEditing(false)
    if (title.trim() !== meeting.title) api.renameMeeting(meeting.id, title)
  }

  const copy = () => {
    api.copyText(meetingText(meeting))
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <>
      <div className="mv-head">
        <div className="mv-title-row">
          {editing ? (
            <input
              className="mv-title-input"
              autoFocus
              value={title}
              placeholder={titleOf(meeting)}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={saveTitle}
              onKeyDown={(e) => {
                if (e.key === 'Enter') saveTitle()
                if (e.key === 'Escape') {
                  setTitle(meeting.title)
                  setEditing(false)
                }
              }}
            />
          ) : (
            <h1 className="mv-title" title="Click to rename" onClick={() => setEditing(true)}>
              {titleOf(meeting)}
              <PencilIcon />
            </h1>
          )}
          <div className="mv-actions">
            <button className="ghost" onClick={copy}>
              {copied ? 'Copied ✓' : 'Copy'}
            </button>
            {confirmDelete ? (
              <span className="mv-confirm">
                Delete for good?
                <button className="danger" onClick={() => api.deleteMeeting(meeting.id)}>
                  Delete
                </button>
                <button className="ghost" onClick={() => setConfirmDelete(false)}>
                  Cancel
                </button>
              </span>
            ) : (
              <button className="ghost" onClick={() => setConfirmDelete(true)}>
                Delete
              </button>
            )}
          </div>
        </div>
        <div className="mv-meta">
          {live && (
            <span className="mv-live">
              <span className="live-dot" /> Recording
            </span>
          )}
          {longDate(meeting.startedAt)} · {clock(meeting.startedAt)}–{clock(meeting.endedAt)} · {duration(meeting)} ·{' '}
          {meeting.lines.length} lines
        </div>
      </div>

      <div className="mv-scroll">
        <section className={`mv-summary ${meeting.summary || showStreamed ? 'has' : ''}`}>
          <div className="mv-summary-head">
            <h3>
              <SparkIcon /> Summary
            </h3>
            {(meeting.summary || summaryAnswer?.done) && !streaming && (
              <button className="link" onClick={onSummarize} disabled={!meeting.lines.length}>
                Redo
              </button>
            )}
          </div>
          {showStreamed ? (
            summaryAnswer.error ? (
              <p className="mv-error">{summaryAnswer.error}</p>
            ) : (
              <>
                <Markdown text={stripTitle(summaryAnswer.text)} />
                <span className="caret" />
              </>
            )
          ) : summary?.error ? (
            <p className="mv-error">{summary.error}</p>
          ) : summary?.web && !meeting.summary ? (
            <p className="mv-note">
              Sent to your {summary.web} tab: the summary is in the floating window. Summaries are saved here only
              in API key mode.
            </p>
          ) : meeting.summary ? (
            <Markdown text={meeting.summary} />
          ) : (
            <div className="mv-summary-empty">
              <p>Key points, decisions, action items and the jargon that came up.</p>
              <button className="primary" onClick={onSummarize} disabled={!meeting.lines.length}>
                Summarize this meeting
              </button>
              {!apiMode && <span className="hint">Opens in your AI tab in the floating window.</span>}
            </div>
          )}
        </section>

        <div className="mv-tabs">
          <button className={tab === 'transcript' ? 'on' : ''} onClick={() => setTab('transcript')}>
            Transcript <span>{meeting.lines.length}</span>
          </button>
          <button className={tab === 'answers' ? 'on' : ''} onClick={() => setTab('answers')}>
            AI answers <span>{meeting.answers.length}</span>
          </button>
        </div>

        {tab === 'transcript' ? (
          <ol className="mv-lines">
            {meeting.lines.map((l, i) => (
              <li key={i}>
                <time>{clock(l.at)}</time>
                <span>{highlight(l.text, query)}</span>
              </li>
            ))}
            {!meeting.lines.length && <p className="notes-none">No speech saved in this meeting.</p>}
          </ol>
        ) : (
          <div className="mv-answers">
            {meeting.answers.map((a, i) => (
              <div className="mv-answer" key={i}>
                <div className="mv-answer-q">
                  <time>{clock(a.at)}</time> {a.question} <span className="hint">· {a.provider}</span>
                </div>
                <p>{a.text}</p>
              </div>
            ))}
            {!meeting.answers.length && (
              <p className="notes-none">
                Answers are saved here in API key mode. In web mode they stay in your ChatGPT, Claude or Gemini
                history.
              </p>
            )}
          </div>
        )}
      </div>

      {children}
    </>
  )
}

// ---- "Ask all meetings" and the empty state ----

function AllView({
  empty,
  saving,
  thread,
  onAsk,
  children
}: {
  empty: boolean
  saving: boolean
  thread: Ask[]
  onAsk: (q: string) => void
  children: ReactNode
}) {
  return (
    <>
      <div className="mv-scroll all">
        {empty ? (
          <div className="hero">
            <div className="hero-icon">
              <NotebookIcon />
            </div>
            <h2>{saving ? 'Your meetings will show up here' : 'Saving meetings is off'}</h2>
            <p>
              {saving ? (
                <>
                  Start listening in the floating window (the mic button or <kbd>Ctrl+Shift+L</kbd>). What's said gets
                  transcribed and saved here, on this PC only. Then summarize it or ask questions later.
                </>
              ) : (
                'Turn it on to keep transcripts of what MeetMind hears, on this PC only.'
              )}
            </p>
            {!saving && (
              <button className="primary" onClick={() => api.setSaveHistory(true)}>
                Turn on meeting history
              </button>
            )}
          </div>
        ) : (
          !thread.length && (
            <div className="hero">
              <div className="hero-icon">
                <SparkIcon big />
              </div>
              <h2>Ask across all your meetings</h2>
              <p>MeetMind finds the meetings that match your question and sends their transcripts along with it.</p>
              <div className="examples">
                {EXAMPLES.map((e) => (
                  <button key={e} onClick={() => onAsk(e)}>
                    {e}
                  </button>
                ))}
              </div>
            </div>
          )
        )}
      </div>
      {children}
    </>
  )
}

// ---- Question box and answers ----

function AskPanel({
  thread,
  answers,
  answeredBy,
  placeholder,
  disabled,
  onAsk,
  onClear
}: {
  thread: Ask[]
  answers: Record<number, NotesAnswer>
  answeredBy: string
  placeholder: string
  disabled?: boolean
  onAsk: (q: string) => void
  onClear: () => void
}) {
  const [text, setText] = useState('')
  const end = useRef<HTMLDivElement>(null)
  const lastText = thread.length ? (answerFor(thread[thread.length - 1], answers)?.text ?? '') : ''
  useEffect(() => end.current?.scrollIntoView({ block: 'end' }), [thread.length, lastText])

  const submit = () => {
    if (!text.trim() || disabled) return
    onAsk(text)
    setText('')
  }

  return (
    <div className="ask-panel">
      {!!thread.length && (
        <div className="ask-thread">
          <button className="ask-clear" title="Clear these answers" onClick={onClear}>
            Clear
          </button>
          {thread.map((a) => {
            const ans = answerFor(a, answers)
            return (
              <div className="qa" key={a.key}>
                <div className="qa-q">{a.question}</div>
                <div className="qa-a">
                  {a.error || ans?.error ? (
                    <p className="mv-error">{a.error ?? ans?.error}</p>
                  ) : a.web ? (
                    <p className="mv-note">Sent to your {a.web} tab. The answer is in the floating window.</p>
                  ) : ans?.text ? (
                    <>
                      <Markdown text={ans.text} />
                      {!ans.done && <span className="caret" />}
                    </>
                  ) : (
                    <span className="thinking">
                      <i />
                      <i />
                      <i />
                    </span>
                  )}
                </div>
              </div>
            )
          })}
          <div ref={end} />
        </div>
      )}
      <div className={`ask-box ${disabled ? 'disabled' : ''}`}>
        <input
          value={text}
          disabled={disabled}
          placeholder={placeholder}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
        />
        <button className="primary" disabled={disabled || !text.trim()} onClick={submit}>
          Ask
        </button>
      </div>
      <div className="ask-by">Answered by {answeredBy} · change it in the floating window's Settings</div>
    </div>
  )
}

function SideFooter({ saving, count, filtered }: { saving: boolean; count: number; filtered: boolean }) {
  const [confirm, setConfirm] = useState(false)
  return (
    <div className="notes-foot">
      <label className="switch-row">
        <input type="checkbox" checked={saving} onChange={(e) => api.setSaveHistory(e.target.checked)} />
        <span className="switch" />
        <span>Save new meetings</span>
      </label>
      {!!count && !filtered &&
        (confirm ? (
          <span className="mv-confirm small">
            Delete all {count}?
            <button
              className="danger"
              onClick={() => {
                api.deleteAllMeetings()
                setConfirm(false)
              }}
            >
              Delete
            </button>
            <button className="ghost" onClick={() => setConfirm(false)}>
              No
            </button>
          </span>
        ) : (
          <button className="link muted" onClick={() => setConfirm(true)}>
            Delete all
          </button>
        ))}
    </div>
  )
}

// ---- Helpers ----

function titleOf(m: { title: string; startedAt: number }): string {
  return m.title || `Meeting at ${clock(m.startedAt)}`
}

function clock(at: number): string {
  return new Date(at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}

function longDate(at: number): string {
  return new Date(at).toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long' })
}

function duration(m: { startedAt: number; endedAt: number }): string {
  const min = Math.max(1, Math.round((m.endedAt - m.startedAt) / 60_000))
  return min < 60 ? `${min} min` : `${Math.floor(min / 60)} h ${min % 60} min`
}

function groupByDay(list: MeetingInfo[]): [string, MeetingInfo[]][] {
  const groups = new Map<string, MeetingInfo[]>()
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  for (const m of list) {
    const d = new Date(m.startedAt)
    d.setHours(0, 0, 0, 0)
    const days = Math.round((today.getTime() - d.getTime()) / 86_400_000)
    const label =
      days === 0
        ? 'Today'
        : days === 1
          ? 'Yesterday'
          : d.toLocaleDateString([], days < 7 ? { weekday: 'long' } : { day: 'numeric', month: 'short', year: 'numeric' })
    groups.set(label, [...(groups.get(label) ?? []), m])
  }
  return [...groups]
}

/** The summary's "Title: …" line is used as the meeting name, so don't show it twice while streaming. */
function stripTitle(text: string): string {
  return text.replace(/^\s*\**title:?\**\s*:?[^\n]*\n*/i, '')
}

function highlight(text: string, query: string): ReactNode {
  const q = query.trim()
  if (!q) return text
  const i = text.toLowerCase().indexOf(q.toLowerCase())
  if (i < 0) return text
  return (
    <>
      {text.slice(0, i)}
      <mark>{text.slice(i, i + q.length)}</mark>
      {text.slice(i + q.length)}
    </>
  )
}

function meetingText(m: Meeting): string {
  const parts = [`${titleOf(m)} (${longDate(m.startedAt)}, ${clock(m.startedAt)}–${clock(m.endedAt)})`]
  if (m.summary) parts.push(`Summary\n${m.summary}`)
  if (m.lines.length) parts.push(`Transcript\n${m.lines.map((l) => `[${clock(l.at)}] ${l.text}`).join('\n')}`)
  if (m.answers.length)
    parts.push(`AI answers\n${m.answers.map((a) => `[${clock(a.at)}] ${a.question}\n${a.text}`).join('\n\n')}`)
  return parts.join('\n\n')
}

// ---- Icons ----

function SearchIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  )
}
function SparkIcon({ big }: { big?: boolean }) {
  const s = big ? 26 : 14
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round">
      <path d="M12 3l1.9 5.6L19.5 10.5l-5.6 1.9L12 18l-1.9-5.6L4.5 10.5l5.6-1.9z" />
      <path d="M19 15.5l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8z" />
    </svg>
  )
}
function LockIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </svg>
  )
}
function PencilIcon() {
  return (
    <svg className="pencil" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 20h4L19 9l-4-4L4 16z" />
    </svg>
  )
}
export function NotebookIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <rect x="5" y="3" width="14" height="18" rx="2.5" />
      <path d="M9 8h6M9 12h6M9 16h3" />
    </svg>
  )
}
