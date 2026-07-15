import { useEffect, useState } from 'react'
import { Search, CornerDownLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'

type Props = {
  open: boolean
  onClose: () => void
}

type Command = {
  id: string
  label: string
  hint?: string
  kind: 'command' | 'file'
}

const commands: Command[] = [
  { id: 'c1', label: 'Go to File…', hint: 'Ctrl+P', kind: 'command' },
  { id: 'c2', label: 'Toggle Theme', hint: 'Ctrl+J', kind: 'command' },
  { id: 'c3', label: 'New Note', hint: 'Ctrl+N', kind: 'command' },
  { id: 'c4', label: 'Search in Vault', hint: 'Ctrl+Shift+F', kind: 'command' },
  { id: 'c5', label: 'Open Graph View', kind: 'command' },
  { id: 'c6', label: 'Toggle AI Assistant', kind: 'command' },
  { id: 'c7', label: 'Rebuild Index', kind: 'command' },
  { id: 'c8', label: 'Open Browser Tab', kind: 'command' },
  { id: 'f1', label: 'Architecture.md', hint: 'Projects/ThinkBrain', kind: 'file' },
  { id: 'f2', label: 'Roadmap.md', hint: 'Projects/ThinkBrain', kind: 'file' },
  { id: 'f3', label: 'Zettelkasten.md', hint: 'Concepts', kind: 'file' },
  { id: 'f4', label: '2026-07-14.md', hint: 'Daily Notes', kind: 'file' },
]

/** Command palette overlay (Ctrl+Shift+P / Ctrl+P). */
export function CommandPalette({ open, onClose }: Props) {
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState(0)

  useEffect(() => {
    if (open) {
      setQuery('')
      setSelected(0)
    }
  }, [open])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!open) return
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setSelected((s) => Math.min(s + 1, filtered.length - 1))
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setSelected((s) => Math.max(s - 1, 0))
      }
      if (e.key === 'Enter') {
        e.preventDefault()
        onClose()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, query])

  if (!open) return null

  const filtered = commands.filter((c) =>
    c.label.toLowerCase().includes(query.toLowerCase()),
  )

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 pt-[15vh]"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl overflow-hidden rounded-lg border border-border bg-popover shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b border-border px-3 py-2.5">
          <Search className="size-4 text-muted-foreground" />
          <input
            autoFocus
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setSelected(0)
            }}
            placeholder="Type a command or file name…"
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
          <kbd className="rounded border border-border px-1.5 text-[10px] text-muted-foreground">esc</kbd>
        </div>
        <div className="max-h-80 overflow-y-auto scroll-thin py-1">
          {filtered.length === 0 && (
            <div className="px-3 py-6 text-center text-sm text-muted-foreground">
              No matching commands
            </div>
          )}
          {filtered.map((c, i) => (
            <button
              key={c.id}
              onMouseEnter={() => setSelected(i)}
              onClick={onClose}
              className={cn(
                'flex w-full items-center gap-2 px-3 py-2 text-left text-sm',
                i === selected ? 'bg-accent text-accent-foreground' : 'text-popover-foreground',
              )}
            >
              {c.kind === 'command' ? (
                <ChevronRight className="size-4 text-muted-foreground" />
              ) : (
                <span className="size-4 text-center text-[10px] text-muted-foreground">📄</span>
              )}
              <span className="flex-1 truncate">{c.label}</span>
              {c.hint && (
                <kbd className="rounded border border-border px-1.5 text-[10px] text-muted-foreground">
                  {c.hint}
                </kbd>
              )}
              {i === selected && <CornerDownLeft className="size-3.5 text-muted-foreground" />}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
