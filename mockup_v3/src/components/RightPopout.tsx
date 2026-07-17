import { useState } from 'react'
import {
  FileText,
  Brain,
  Send,
  Sparkles,
  ChevronRight,
  Plus,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  outline,
  backlinks,
  properties,
  assistantMessages,
  type RightView,
} from '@/data/mockData'

type Props = {
  view: RightView
}

/** Right popout panel — content switches based on the compact top-right menu. */
export function RightPopout({ view }: Props) {
  return (
    <div
      className="flex h-full flex-col bg-sidebar border-l border-border"
      style={{ width: 'var(--right-sidebar-w)' }}
    >
      <div className="flex h-9 shrink-0 items-center px-3">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          {viewLabel(view)}
        </span>
      </div>
      <div className="flex-1 overflow-y-auto scroll-thin text-sm">
        {view === 'outline' && <OutlinePanel />}
        {view === 'backlinks' && <BacklinksPanel />}
        {view === 'properties' && <PropertiesPanel />}
        {view === 'assistant' && <AssistantPanel />}
      </div>
    </div>
  )
}

function viewLabel(view: RightView): string {
  return {
    outline: 'Outline',
    backlinks: 'Backlinks',
    properties: 'Properties',
    assistant: 'AI Assistant',
  }[view]
}

/* -------------------------------------------------------------------------- */
/* Outline                                                                    */
/* -------------------------------------------------------------------------- */

function OutlinePanel() {
  return (
    <div className="pb-2">
      {outline.map((h) => (
        <button
          key={h.id}
          className="flex w-full items-center gap-1 py-1 pr-2 text-left text-[13px] text-sidebar-foreground hover:bg-accent/60"
          style={{ paddingLeft: (h.level - 1) * 14 + 12 }}
        >
          <ChevronRight className="size-3 shrink-0 text-muted-foreground" />
          <span className="truncate">{h.text}</span>
        </button>
      ))}
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* Backlinks                                                                  */
/* -------------------------------------------------------------------------- */

function BacklinksPanel() {
  return (
    <div className="px-3 pb-2">
      <div className="mb-2 text-[11px] text-muted-foreground">
        {backlinks.length} notes link here
      </div>
      <div className="flex flex-col gap-2">
        {backlinks.map((b) => (
          <button
            key={b.id}
            className="rounded-md border border-border p-2 text-left hover:border-primary/40 hover:bg-accent/40 transition-colors"
          >
            <div className="flex items-center gap-1.5 text-[13px] font-medium">
              <FileText className="size-3.5 text-primary/80" />
              {b.title}
            </div>
            <p className="mt-1 text-[12px] text-muted-foreground">{b.snippet}</p>
          </button>
        ))}
      </div>
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* Properties                                                                 */
/* -------------------------------------------------------------------------- */

function PropertiesPanel() {
  return (
    <div className="px-3 pb-2">
      <div className="flex flex-col gap-2">
        {properties.map((p) => (
          <div key={p.key} className="flex flex-col gap-0.5">
            <span className="text-[11px] font-medium text-muted-foreground">{p.key}</span>
            <div className="rounded-md border border-input bg-background px-2 py-1.5 text-[13px]">
              {p.value}
            </div>
          </div>
        ))}
      </div>
      <button className="mt-3 flex w-full items-center justify-center gap-1 rounded-md border border-dashed border-border py-1.5 text-[12px] text-muted-foreground hover:bg-accent/40">
        <Plus className="size-3.5" />
        Add property
      </button>
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* AI Assistant                                                               */
/* -------------------------------------------------------------------------- */

function AssistantPanel() {
  const [input, setInput] = useState('')
  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 overflow-y-auto scroll-thin px-3 pb-2">
        <div className="mb-3 flex items-center gap-2 rounded-md bg-accent/60 p-2 text-[12px] text-accent-foreground">
          <Sparkles className="size-4 text-primary" />
          Context: Architecture.md
        </div>
        <div className="flex flex-col gap-3">
          {assistantMessages.map((m) => (
            <div
              key={m.id}
              className={cn(
                'flex flex-col gap-1',
                m.role === 'user' ? 'items-end' : 'items-start',
              )}
            >
              <div
                className={cn(
                  'max-w-[90%] rounded-lg px-2.5 py-1.5 text-[13px] leading-relaxed',
                  m.role === 'user'
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-secondary text-secondary-foreground',
                )}
              >
                {m.text}
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="shrink-0 border-t border-border p-2">
        <div className="flex items-end gap-1 rounded-md border border-input bg-background px-2 py-1">
          <Brain className="size-4 shrink-0 text-primary" />
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask about your notes…"
            rows={1}
            className="max-h-24 flex-1 resize-none bg-transparent text-[13px] outline-none placeholder:text-muted-foreground"
          />
          <button className="flex size-6 shrink-0 items-center justify-center rounded bg-primary text-primary-foreground hover:bg-primary/90">
            <Send className="size-3.5" />
          </button>
        </div>
      </div>
    </div>
  )
}
