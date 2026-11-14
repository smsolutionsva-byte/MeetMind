import type { ReactNode } from 'react'

export interface ChoiceOption<T extends string> {
  id: T
  title: string
  desc: ReactNode
  badge?: string
}

/** Big A/B cards for setup decisions. */
export function Choice<T extends string>({
  options,
  value,
  onChange,
  label
}: {
  options: ChoiceOption<T>[]
  value: T
  onChange: (v: T) => void
  label: string
}) {
  return (
    <div className="choices" role="radiogroup" aria-label={label}>
      {options.map((o, i) => (
        <button
          key={o.id}
          role="radio"
          aria-checked={value === o.id}
          className={`choice ${value === o.id ? 'selected' : ''}`}
          onClick={() => onChange(o.id)}
        >
          <span className="choice-letter">{String.fromCharCode(65 + i)}</span>
          <span className="choice-text">
            <span className="choice-title">
              {o.title}
              {o.badge && <span className="badge">{o.badge}</span>}
            </span>
            <span className="choice-desc">{o.desc}</span>
          </span>
        </button>
      ))}
    </div>
  )
}
