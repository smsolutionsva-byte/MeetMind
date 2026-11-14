import { useEffect, useState } from 'react'
import { HOTKEY_LABELS, type AppState, type HotkeyAction } from '../../shared/types'

const api = window.meetmind

/** "CommandOrControl+Shift+L" → "Ctrl + Shift + L" */
export const prettyKeys = (accel: string) =>
  accel ? accel.replace('CommandOrControl', 'Ctrl').split('+').join(' + ') : 'Off'

const CODE_KEYS: Record<string, string> = {
  Space: 'Space', Enter: 'Enter', Tab: 'Tab', Backquote: '`', Minus: '-', Equal: '=',
  BracketLeft: '[', BracketRight: ']', Backslash: '\\', Semicolon: ';', Quote: "'",
  Comma: ',', Period: '.', Slash: '/', ArrowUp: 'Up', ArrowDown: 'Down', ArrowLeft: 'Left',
  ArrowRight: 'Right', Home: 'Home', End: 'End', PageUp: 'PageUp', PageDown: 'PageDown', Insert: 'Insert'
}

/** Turn a key press into an Electron accelerator, or null if it isn't a usable shortcut yet. */
function toAccelerator(e: KeyboardEvent): string | null {
  let key: string | undefined
  if (/^Key[A-Z]$/.test(e.code)) key = e.code.slice(3)
  else if (/^Digit\d$/.test(e.code)) key = e.code.slice(5)
  else if (/^Numpad\d$/.test(e.code)) key = 'num' + e.code.slice(6)
  else if (/^F\d{1,2}$/.test(e.code)) key = e.code
  else key = CODE_KEYS[e.code]
  // Some remote-desktop tools and key remappers send no physical key code; use the character.
  if (!key && !e.code && /^[a-z0-9]$/i.test(e.key)) key = e.key.toUpperCase()
  if (!key) return null // a modifier on its own, or an unsupported key
  const mods = [
    e.ctrlKey || e.metaKey ? 'CommandOrControl' : '',
    e.altKey ? 'Alt' : '',
    e.shiftKey ? 'Shift' : ''
  ].filter(Boolean)
  // Plain letters would fire while typing anywhere; require a modifier (F-keys are fine alone).
  if (!mods.length && !/^F\d/.test(key)) return null
  return [...mods, key].join('+')
}

export function HotkeyEditor({ state, compact = false }: { state: AppState; compact?: boolean }) {
  const [recording, setRecording] = useState<HotkeyAction | null>(null)
  const [error, setError] = useState<{ action: HotkeyAction; text: string } | null>(null)
  const actions = Object.keys(HOTKEY_LABELS) as HotkeyAction[]
  const shown = compact ? actions.slice(0, 3) : actions

  useEffect(() => {
    if (!recording) return
    api.pauseHotkeys(true)
    const onKey = async (e: KeyboardEvent) => {
      e.preventDefault()
      e.stopPropagation()
      if (e.code === 'Escape') return setRecording(null)
      const accel = e.code === 'Backspace' || e.code === 'Delete' ? '' : toAccelerator(e)
      if (accel === null) return // keep waiting for a full combo
      const err = await api.setHotkey(recording, accel)
      setError(err ? { action: recording, text: err } : null)
      setRecording(null)
    }
    window.addEventListener('keydown', onKey, true)
    return () => {
      window.removeEventListener('keydown', onKey, true)
      api.pauseHotkeys(false)
    }
  }, [recording])

  return (
    <div className="hotkeys">
      {shown.map((a) => {
        const conflict = state.hotkeyConflicts.includes(a)
        return (
          <div key={a} className="hotkey-row">
            <span>{HOTKEY_LABELS[a]}</span>
            <button
              className={`keycap ${recording === a ? 'recording' : ''} ${conflict ? 'conflict' : ''}`}
              onClick={() => setRecording(recording === a ? null : a)}
              title={conflict ? 'Another app already uses this shortcut' : 'Click, then press the new keys'}
            >
              {recording === a ? 'Press keys… (Esc cancels)' : prettyKeys(state.settings.hotkeys[a])}
            </button>
            {error?.action === a && <span className="error">{error.text}</span>}
          </div>
        )
      })}
      {!compact && (
        <p className="hint">
          Click a shortcut and press new keys. Backspace turns it off.{' '}
          <button className="link" onClick={() => api.resetHotkeys()}>Reset to defaults</button>
        </p>
      )}
    </div>
  )
}
