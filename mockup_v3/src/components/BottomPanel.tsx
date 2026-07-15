import { useState } from 'react'
import { Terminal, X, ChevronDown, Plus, Trash2, AlertCircle, Info } from 'lucide-react'
import { cn } from '@/lib/utils'

type Props = {
  onClose: () => void
}

type PanelTab = 'terminal' | 'problems' | 'output' | 'backlinks'

/** Bottom panel (terminal / problems / output) — toggleable from the status bar. */
export function BottomPanel({ onClose }: Props) {
  const [active, setActive] = useState<PanelTab>('terminal')

  const tabs: { id: PanelTab; label: string; badge?: number }[] = [
    { id: 'problems', label: 'Problems', badge: 2 },
    { id: 'output', label: 'Output' },
    { id: 'terminal', label: 'Terminal' },
    { id: 'backlinks', label: 'Backlinks Preview' },
  ]

  return (
    <div className="flex h-48 shrink-0 flex-col bg-panel border-t border-border">
      {/* Panel tab strip */}
      <div className="flex h-8 shrink-0 items-center justify-between border-b border-border pr-2">
        <div className="flex h-full items-center">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setActive(t.id)}
              className={cn(
                'relative flex h-full items-center gap-1.5 px-3 text-[11px] uppercase tracking-wider transition-colors',
                active === t.id
                  ? 'text-foreground'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {t.label}
              {t.badge && (
                <span className="rounded-full bg-destructive px-1.5 text-[9px] font-bold text-destructive-foreground">
                  {t.badge}
                </span>
              )}
              {active === t.id && (
                <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary" />
              )}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-0.5">
          <button className="flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-accent/60 hover:text-foreground">
            <Plus className="size-3.5" />
          </button>
          <button className="flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-accent/60 hover:text-foreground">
            <Trash2 className="size-3.5" />
          </button>
          <button className="flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-accent/60 hover:text-foreground">
            <ChevronDown className="size-3.5" />
          </button>
          <button
            onClick={onClose}
            className="flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-accent/60 hover:text-foreground"
          >
            <X className="size-3.5" />
          </button>
        </div>
      </div>

      {/* Panel content */}
      <div className="flex-1 overflow-y-auto scroll-thin p-2 text-[12px] font-mono">
        {active === 'terminal' && <TerminalContent />}
        {active === 'problems' && <ProblemsContent />}
        {active === 'output' && <OutputContent />}
        {active === 'backlinks' && <BacklinksPreviewContent />}
      </div>
    </div>
  )
}

function TerminalContent() {
  return (
    <div className="text-muted-foreground">
      <div className="flex items-center gap-1.5 text-foreground">
        <Terminal className="size-3.5 text-success" />
        <span>thinkbrain@vault</span>
        <span className="text-muted-foreground">:~/vault$</span>
      </div>
      <div className="mt-1">thinkbrain index --rebuild</div>
      <div className="text-success">✓ Indexed 247 notes in 1.2s</div>
      <div className="mt-1">thinkbrain search "local-first"</div>
      <div className="text-foreground">5 results across 5 files</div>
      <div className="mt-1 flex items-center gap-1.5">
        <span className="text-foreground">thinkbrain@vault</span>
        <span className="text-muted-foreground">:~/vault$</span>
        <span className="inline-block h-3.5 w-2 animate-pulse bg-foreground" />
      </div>
    </div>
  )
}

function ProblemsContent() {
  const problems = [
    { file: 'Architecture.md', line: 42, msg: 'Broken wikilink: [[Sync Layer]] — target not found', sev: 'warn' },
    { file: 'Roadmap.md', line: 8, msg: 'Frontmatter field "status" uses deprecated value "wip"', sev: 'warn' },
  ]
  return (
    <div className="flex flex-col gap-1">
      {problems.map((p, i) => (
        <div key={i} className="flex items-start gap-2 rounded px-1 py-1 hover:bg-accent/40">
          <AlertCircle className="mt-0.5 size-3.5 shrink-0 text-warning" />
          <span className="text-foreground">{p.msg}</span>
          <span className="ml-auto shrink-0 text-muted-foreground">{p.file}:{p.line}</span>
        </div>
      ))}
    </div>
  )
}

function OutputContent() {
  return (
    <div className="text-muted-foreground">
      <div className="text-info flex items-center gap-1.5">
        <Info className="size-3.5" /> [indexer] watching vault for changes…
      </div>
      <div>[14:32:01] detected change: Projects/ThinkBrain/Architecture.md</div>
      <div>[14:32:01] re-indexed 1 file (247 total)</div>
      <div>[14:32:14] detected change: Daily Notes/2026-07-14.md</div>
      <div>[14:32:14] re-indexed 1 file (247 total)</div>
    </div>
  )
}

function BacklinksPreviewContent() {
  return (
    <div className="text-muted-foreground">
      <div className="text-foreground">Backlinks to Architecture.md (4)</div>
      <div className="mt-1">→ Roadmap.md: "depends on the Architecture decisions…"</div>
      <div>→ MOC — Index.md: "See Architecture for the layered breakdown."</div>
      <div>→ Daily 2026-07-12.md: "Refined the plugin model per Architecture…"</div>
      <div>→ Plugin Extensibility.md: "Hooks defined in Architecture → System Layers."</div>
    </div>
  )
}
