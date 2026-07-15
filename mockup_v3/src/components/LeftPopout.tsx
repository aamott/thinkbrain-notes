import { useState } from 'react'
import {
  ChevronRight,
  ChevronDown,
  FileText,
  Folder,
  Search,
  Plus,
  MoreHorizontal,
  Hash,
  Sparkles,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  fileTree,
  searchResults,
  type FileNode,
  type LeftView,
} from '@/data/mockData'

type Props = {
  view: LeftView
}

/** Left popout panel — content switches based on the active activity-bar view. */
export function LeftPopout({ view }: Props) {
  return (
    <div className="flex h-full w-64 flex-col bg-sidebar border-r border-border">
      <div className="flex h-9 shrink-0 items-center justify-between px-3">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          {viewLabel(view)}
        </span>
        <div className="flex items-center gap-0.5">
          <button className="flex size-5 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground">
            <Plus className="size-3.5" />
          </button>
          <button className="flex size-5 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground">
            <MoreHorizontal className="size-3.5" />
          </button>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto scroll-thin text-sm">
        {view === 'explorer' && <ExplorerTree />}
        {view === 'search' && <SearchPanel />}
        {view === 'git' && <GitPanel />}
        {view === 'tags' && <TagsPanel />}
        {view === 'extensions' && <ExtensionsPanel />}
      </div>
    </div>
  )
}

function viewLabel(view: LeftView): string {
  return {
    explorer: 'Explorer',
    search: 'Search',
    git: 'Source Control',
    tags: 'Tags',
    extensions: 'Extensions',
  }[view]
}

/* -------------------------------------------------------------------------- */
/* Explorer                                                                   */
/* -------------------------------------------------------------------------- */

function ExplorerTree() {
  const [open, setOpen] = useState<Record<string, boolean>>({
    vault: true,
    daily: true,
    projects: true,
    'p-tb': true,
  })
  const [selected, setSelected] = useState<string | null>('p1')

  const toggle = (id: string) => setOpen((p) => ({ ...p, [id]: !p[id] }))

  const renderNode = (node: FileNode, depth: number) => {
    const isOpen = open[node.id]
    const isSelected = selected === node.id
    const Icon = node.icon ?? (node.type === 'folder' ? Folder : FileText)
    return (
      <div key={node.id}>
        <button
          onClick={() => {
            if (node.type === 'folder') toggle(node.id)
            else setSelected(node.id)
          }}
          className={cn(
            'flex w-full items-center gap-1 py-[3px] pr-2 text-left text-[13px] transition-colors',
            isSelected ? 'bg-accent text-accent-foreground' : 'text-sidebar-foreground hover:bg-accent/60',
          )}
          style={{ paddingLeft: depth * 12 + 8 }}
        >
          {node.type === 'folder' ? (
            isOpen ? (
              <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
            ) : (
              <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" />
            )
          ) : (
            <span className="w-3.5 shrink-0" />
          )}
          <Icon
            className={cn(
              'size-4 shrink-0',
              node.type === 'folder' ? 'text-muted-foreground' : 'text-primary/80',
            )}
          />
          <span className="truncate">{node.name}</span>
          {node.badge && (
            <span className="ml-auto rounded-full bg-primary/15 px-1.5 text-[10px] font-medium text-primary">
              {node.badge}
            </span>
          )}
        </button>
        {node.type === 'folder' && isOpen && node.children?.map((c) => renderNode(c, depth + 1))}
      </div>
    )
  }

  return <div className="pb-2">{fileTree.map((n) => renderNode(n, 0))}</div>
}

/* -------------------------------------------------------------------------- */
/* Search                                                                     */
/* -------------------------------------------------------------------------- */

function SearchPanel() {
  return (
    <div className="flex flex-col gap-2 px-3 pb-2">
      <div className="flex items-center gap-2 rounded-md border border-input bg-background px-2 py-1.5">
        <Search className="size-3.5 text-muted-foreground" />
        <input
          placeholder="Search vault…"
          defaultValue="local-first"
          className="w-full bg-transparent text-[13px] outline-none placeholder:text-muted-foreground"
        />
      </div>
      <div className="text-[11px] text-muted-foreground">
        {searchResults.length} results in {searchResults.length} files
      </div>
      <div className="flex flex-col gap-2">
        {searchResults.map((r) => (
          <div key={r.id} className="rounded px-1 py-1 hover:bg-accent/60 cursor-pointer">
            <div className="flex items-center gap-1.5 text-[13px] font-medium">
              <FileText className="size-3.5 text-primary/80" />
              {r.file}
              <span className="ml-auto text-[10px] text-muted-foreground">:{r.line}</span>
            </div>
            <div className="mt-0.5 pl-5 text-[12px] text-muted-foreground">{r.text}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* Source Control                                                             */
/* -------------------------------------------------------------------------- */

function GitPanel() {
  const changes = [
    { id: 'g1', name: 'Architecture.md', status: 'M' },
    { id: 'g2', name: 'Roadmap.md', status: 'M' },
    { id: 'g3', name: 'Open Questions.md', status: 'U' },
    { id: 'g4', name: 'Daily 2026-07-14.md', status: 'U' },
  ]
  return (
    <div className="px-3 pb-2">
      <div className="mb-2 flex items-center gap-2 rounded-md border border-input bg-background px-2 py-1.5 text-[13px] text-muted-foreground">
        <input placeholder="Message (Ctrl+Enter to commit)" className="w-full bg-transparent outline-none" />
      </div>
      <button className="mb-3 w-full rounded-md bg-primary py-1.5 text-[12px] font-medium text-primary-foreground hover:bg-primary/90">
        Commit
      </button>
      <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Changes ({changes.length})</div>
      <div className="mt-1 flex flex-col">
        {changes.map((c) => (
          <div key={c.id} className="flex items-center gap-2 py-1 text-[13px] hover:bg-accent/60 rounded px-1 cursor-pointer">
            <FileText className="size-3.5 text-muted-foreground" />
            <span className="truncate">{c.name}</span>
            <span
              className={cn(
                'ml-auto text-[11px] font-bold',
                c.status === 'M' ? 'text-warning' : 'text-success',
              )}
            >
              {c.status}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* Tags                                                                       */
/* -------------------------------------------------------------------------- */

function TagsPanel() {
  const tags = [
    { name: 'architecture', count: 8 },
    { name: 'core', count: 5 },
    { name: 'design', count: 12 },
    { name: 'daily', count: 47 },
    { name: 'research', count: 9 },
    { name: 'todo', count: 3 },
    { name: 'moc', count: 6 },
  ]
  return (
    <div className="px-3 pb-2">
      <div className="flex flex-col gap-0.5">
        {tags.map((t) => (
          <button
            key={t.name}
            className="flex items-center gap-2 rounded px-1 py-1 text-[13px] hover:bg-accent/60"
          >
            <Hash className="size-3.5 text-primary/70" />
            <span>{t.name}</span>
            <span className="ml-auto text-[11px] text-muted-foreground">{t.count}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* Extensions                                                                 */
/* -------------------------------------------------------------------------- */

function ExtensionsPanel() {
  const exts = [
    { name: 'Calendar', author: 'thinkbrain', desc: 'Daily notes calendar view', installed: true },
    { name: 'Kanban', author: 'community', desc: 'Board view from tagged notes', installed: true },
    { name: 'Excalidraw', author: 'community', desc: 'Embedded drawings in notes', installed: false },
    { name: 'PDF Export', author: 'thinkbrain', desc: 'Export notes to PDF', installed: false },
  ]
  return (
    <div className="px-3 pb-2">
      <div className="mb-2 flex items-center gap-2 rounded-md border border-input bg-background px-2 py-1.5">
        <Search className="size-3.5 text-muted-foreground" />
        <input placeholder="Search extensions…" className="w-full bg-transparent text-[13px] outline-none" />
      </div>
      <div className="flex flex-col gap-2">
        {exts.map((e) => (
          <div key={e.name} className="rounded-md border border-border p-2">
            <div className="flex items-center gap-2">
              <Sparkles className="size-4 text-primary" />
              <span className="text-[13px] font-medium">{e.name}</span>
            </div>
            <p className="mt-1 text-[12px] text-muted-foreground">{e.desc}</p>
            <div className="mt-1.5 flex items-center justify-between">
              <span className="text-[10px] text-muted-foreground">{e.author}</span>
              <button
                className={cn(
                  'rounded px-2 py-0.5 text-[11px] font-medium',
                  e.installed
                    ? 'bg-secondary text-secondary-foreground'
                    : 'bg-primary text-primary-foreground hover:bg-primary/90',
                )}
              >
                {e.installed ? 'Installed' : 'Install'}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
