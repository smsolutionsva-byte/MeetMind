import { Fragment, type ReactNode } from 'react'

/**
 * Just enough Markdown for AI summaries: section headings, "- " and "1." lists, **bold**.
 * Builds React elements (no HTML injection), so model output can't run anything.
 */
export function Markdown({ text }: { text: string }) {
  const lines = text.replace(/\r/g, '').split('\n')
  const blocks: ReactNode[] = []
  let list: { ordered: boolean; items: string[] } | null = null
  const flush = () => {
    if (!list) return
    const items = list.items.map((t, i) => <li key={i}>{inline(t)}</li>)
    blocks.push(list.ordered ? <ol key={blocks.length}>{items}</ol> : <ul key={blocks.length}>{items}</ul>)
    list = null
  }
  lines.forEach((raw, i) => {
    const line = raw.trim()
    const bullet = line.match(/^[-*•]\s+(.*)$/)
    const numbered = line.match(/^\d+[.)]\s+(.*)$/)
    if (bullet || numbered) {
      const ordered = !!numbered && !bullet
      if (!list || list.ordered !== ordered) {
        flush()
        list = { ordered, items: [] }
      }
      list.items.push((bullet ?? numbered)![1])
      return
    }
    flush()
    if (!line) return
    const heading = line.match(/^#{1,6}\s+(.*)$/)
    const next = lines.slice(i + 1).find((l) => l.trim())?.trim() ?? ''
    // "Key points" on its own line, followed by a list, reads as a section heading.
    const looksLikeHeading =
      heading || (line.length < 48 && !/[.?!:,]$/.test(line.replace(/\*+$/, '')) && /^([-*•]|\d+[.)])\s/.test(next))
    if (looksLikeHeading) blocks.push(<h4 key={blocks.length}>{inline((heading?.[1] ?? line).replace(/^\*\*(.*)\*\*:?$/, '$1').replace(/:$/, ''))}</h4>)
    else blocks.push(<p key={blocks.length}>{inline(line)}</p>)
  })
  flush()
  return <div className="md">{blocks}</div>
}

function inline(text: string): ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*)/g)
  return parts.map((p, i) =>
    p.startsWith('**') && p.endsWith('**') && p.length > 4 ? <b key={i}>{p.slice(2, -2)}</b> : <Fragment key={i}>{p}</Fragment>
  )
}
