import {
  ChevronRight,
  Globe,
  RefreshCw,
  ArrowLeft,
  ArrowRight,
  Lock,
  Brain,
  Eye,
  Loader2,
  Star,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { editorContent, type Tab } from '@/data/mockData'

type Props = {
  tab: Tab
}

/** Main editor area: breadcrumbs + content that varies by tab kind. */
export function EditorArea({ tab }: Props) {
  return (
    <div className="flex h-full min-w-0 flex-1 flex-col bg-editor">
      <Breadcrumbs path={tab.path} />
      <div className="min-h-0 flex-1 overflow-hidden">
        {tab.kind === 'editor' && <CodeMirrorEditor />}
        {tab.kind === 'browser' && <BrowserView url={tab.title} />}
        {tab.kind === 'graph' && <GraphView />}
        {tab.kind === 'preview' && <PreviewView />}
        {tab.kind === 'settings' && <SettingsView />}
      </div>
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* Breadcrumbs                                                                */
/* -------------------------------------------------------------------------- */

function Breadcrumbs({ path }: { path: string }) {
  const parts = path.split('/')
  return (
    <div className="flex h-7 shrink-0 items-center gap-0.5 border-b border-border px-3 text-[12px] text-muted-foreground">
      {parts.map((p, i) => (
        <div key={i} className="flex items-center gap-0.5">
          {i > 0 && <ChevronRight className="size-3" />}
          <span className={cn(i === parts.length - 1 && 'text-foreground')}>{p}</span>
        </div>
      ))}
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* CodeMirror-style editor                                                    */
/* -------------------------------------------------------------------------- */

function CodeMirrorEditor() {
  const lines = editorContent.split('\n')
  return (
    <div className="flex h-full overflow-hidden font-mono text-[13px] leading-[1.6]">
      {/* Gutter */}
      <div className="select-none py-2 pr-3 pl-4 text-right text-muted-foreground/60">
        {lines.map((_, i) => (
          <div key={i}>{i + 1}</div>
        ))}
      </div>
      {/* Content with simple syntax highlighting */}
      <div className="flex-1 overflow-y-auto scroll-thin py-2 pr-4">
        <pre className="whitespace-pre-wrap break-words text-editor-foreground">
          {lines.map((line, i) => (
            <div key={i} className="min-h-[1.6em]">
              <HighlightedLine line={line} />
            </div>
          ))}
        </pre>
      </div>
    </div>
  )
}

/** Very lightweight Markdown syntax highlighting for the mockup. */
function HighlightedLine({ line }: { line: string }) {
  if (/^#{1,6}\s/.test(line)) {
    return <span className="text-primary font-semibold">{line}</span>
  }
  if (/^[-*]\s/.test(line)) {
    return <span className="text-muted-foreground">{line}</span>
  }
  // bold **text**
  const parts = line.split(/(\*\*[^*]+\*\*)/g)
  return (
    <>
      {parts.map((p, i) =>
        p.startsWith('**') && p.endsWith('**') ? (
          <span key={i} className="font-semibold text-editor-foreground">{p.slice(2, -2)}</span>
        ) : (
          <span key={i}>{p}</span>
        ),
      )}
    </>
  )
}

/* -------------------------------------------------------------------------- */
/* Browser view                                                               */
/* -------------------------------------------------------------------------- */

function BrowserView({ url }: { url: string }) {
  return (
    <div className="flex h-full flex-col">
      {/* Browser chrome */}
      <div className="flex h-10 shrink-0 items-center gap-2 border-b border-border bg-panel px-3">
        <button className="flex size-7 items-center justify-center rounded text-muted-foreground hover:bg-accent/60 hover:text-foreground">
          <ArrowLeft className="size-4" />
        </button>
        <button className="flex size-7 items-center justify-center rounded text-muted-foreground hover:bg-accent/60 hover:text-foreground">
          <ArrowRight className="size-4" />
        </button>
        <button className="flex size-7 items-center justify-center rounded text-muted-foreground hover:bg-accent/60 hover:text-foreground">
          <RefreshCw className="size-4" />
        </button>
        <div className="flex flex-1 items-center gap-2 rounded-full border border-input bg-background px-3 py-1">
          <Lock className="size-3 text-success" />
          <span className="text-[12px] text-muted-foreground">https://{url}</span>
        </div>
        <button className="flex size-7 items-center justify-center rounded text-muted-foreground hover:bg-accent/60 hover:text-foreground">
          <Star className="size-4" />
        </button>
      </div>
      {/* Rendered page mock — uses a fixed light surface to mimic a website */}
      <div className="flex-1 overflow-y-auto scroll-thin bg-[#fafafa] text-neutral-900 dark:bg-[#1a1a1a] dark:text-neutral-100">
        <div className="mx-auto max-w-2xl px-8 py-10">
          <div className="mb-2 flex items-center gap-2">
            <Globe className="size-5 text-neutral-400" />
            <span className="text-xs font-semibold uppercase tracking-widest text-neutral-400">
              zettelkasten.de
            </span>
          </div>
          <h1 className="text-3xl font-bold">Introduction to the Zettelkasten Method</h1>
          <p className="mt-4 text-neutral-600 dark:text-neutral-300">
            The Zettelkasten method is a system of taking and connecting notes. Each note is
            atomic, self-contained, and linked to related ideas — forming a personal knowledge
            graph that grows smarter over time.
          </p>
          <h2 className="mt-8 text-xl font-semibold">Core ideas</h2>
          <ul className="mt-3 list-disc pl-6 text-neutral-600 dark:text-neutral-300">
            <li>Fleeting notes — quick captures, refined later.</li>
            <li>Literature notes — what you read, in your own words.</li>
            <li>Permanent notes — atomic, linked, durable.</li>
          </ul>
          <div className="mt-8 rounded-lg border border-neutral-200 bg-neutral-50 p-4 text-sm text-neutral-600 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-300">
            <strong>Tip:</strong> ThinkBrain supports all three note types out of the box, with
            automatic backlinking and a graph view.
          </div>
          <p className="mt-6 text-neutral-600 dark:text-neutral-300">
            This is a mock browser tab. In the real app, any tab can host arbitrary content — a
            web view, a graph, a rendered preview, or a CodeMirror editor.
          </p>
        </div>
      </div>
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* Graph view                                                                 */
/* -------------------------------------------------------------------------- */

function GraphView() {
  const nodes = [
    { id: 'n1', x: 50, y: 30, label: 'Architecture', main: true },
    { id: 'n2', x: 20, y: 60, label: 'Roadmap' },
    { id: 'n3', x: 80, y: 55, label: 'MOC Index' },
    { id: 'n4', x: 35, y: 85, label: 'Zettelkasten' },
    { id: 'n5', x: 70, y: 82, label: 'Daily 07-14' },
    { id: 'n6', x: 15, y: 25, label: 'Plugins' },
    { id: 'n7', x: 88, y: 28, label: 'Sync' },
  ]
  const edges = [
    ['n1', 'n2'],
    ['n1', 'n3'],
    ['n1', 'n4'],
    ['n1', 'n5'],
    ['n1', 'n6'],
    ['n1', 'n7'],
    ['n3', 'n4'],
    ['n2', 'n5'],
  ]
  const pos = Object.fromEntries(nodes.map((n) => [n.id, n]))
  return (
    <div className="relative h-full w-full bg-editor">
      <svg className="absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none">
        {edges.map(([a, b], i) => (
          <line
            key={i}
            x1={pos[a].x}
            y1={pos[a].y}
            x2={pos[b].x}
            y2={pos[b].y}
            stroke="currentColor"
            className="text-border"
            strokeWidth="0.3"
          />
        ))}
      </svg>
      {nodes.map((n) => (
        <div
          key={n.id}
          className={cn(
            'absolute -translate-x-1/2 -translate-y-1/2 rounded-full px-2 py-1 text-[11px] font-medium border',
            n.main
              ? 'border-primary bg-primary text-primary-foreground'
              : 'border-border bg-card text-card-foreground',
          )}
          style={{ left: `${n.x}%`, top: `${n.y}%` }}
        >
          {n.label}
        </div>
      ))}
      <div className="absolute bottom-3 left-3 flex items-center gap-2 rounded-md bg-card/80 px-2 py-1 text-[11px] text-muted-foreground backdrop-blur">
        <Brain className="size-3.5 text-primary" />
        {nodes.length} notes · {edges.length} links
      </div>
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* Preview view                                                               */
/* -------------------------------------------------------------------------- */

function PreviewView() {
  return (
    <div className="flex h-full flex-col">
      <div className="flex h-8 shrink-0 items-center gap-2 border-b border-border bg-panel px-3 text-[11px] text-muted-foreground">
        <Eye className="size-3.5" />
        Rendered preview
      </div>
      <div className="flex-1 overflow-y-auto scroll-thin px-10 py-8">
        <article className="prose prose-sm max-w-none">
          <h1 className="text-2xl font-bold text-editor-foreground">Roadmap</h1>
          <p className="mt-2 text-muted-foreground">
            Milestones for ThinkBrain, derived from the Architecture note.
          </p>
          <h2 className="mt-6 text-lg font-semibold text-editor-foreground">Milestone 1 — Local-first MVP</h2>
          <ul className="mt-2 list-disc pl-6 text-muted-foreground">
            <li>File explorer over a vault folder</li>
            <li>CodeMirror 6 editor with Markdown</li>
            <li>Full-text search</li>
          </ul>
          <h2 className="mt-6 text-lg font-semibold text-editor-foreground">Open Questions</h2>
          <div className="mt-2 rounded-md border-l-4 border-warning bg-warning/10 p-3 text-sm text-editor-foreground">
            <div className="flex items-center gap-2 font-medium">
              <Loader2 className="size-4 text-warning" /> TODO
            </div>
            <p className="mt-1">How do plugins declare their own tab content types?</p>
          </div>
          <div className="mt-2 rounded-md border-l-4 border-warning bg-warning/10 p-3 text-sm text-editor-foreground">
            <div className="flex items-center gap-2 font-medium">
              <Loader2 className="size-4 text-warning" /> TODO
            </div>
            <p className="mt-1">Should the graph view be a first-class tab or a panel?</p>
          </div>
        </article>
      </div>
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* Settings view                                                              */
/* -------------------------------------------------------------------------- */

function SettingsView() {
  return (
    <div className="flex h-full overflow-y-auto scroll-thin p-8">
      <div className="mx-auto max-w-2xl">
        <h1 className="text-2xl font-bold text-editor-foreground">Settings</h1>
        <p className="mt-1 text-muted-foreground">Mock settings tab — another content type.</p>
      </div>
    </div>
  )
}
