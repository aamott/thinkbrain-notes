import {
  FileText,
  Folder,
  FolderOpen,
  Hash,
  Globe,
  Brain,
  Search,
  GitBranch,
  Settings,
  Sparkles,
  type LucideIcon,
} from 'lucide-react'

/** A node in the file explorer tree. */
export type FileNode = {
  id: string
  name: string
  type: 'folder' | 'file'
  icon?: LucideIcon
  children?: FileNode[]
  badge?: string
}

/** The kind of content a tab can render. */
export type TabKind = 'editor' | 'browser' | 'graph' | 'preview' | 'settings'

export type Tab = {
  id: string
  title: string
  kind: TabKind
  icon: LucideIcon
  dirty?: boolean
  pinned?: boolean
  path: string
}

/** Left activity-bar views. */
export type LeftView = 'explorer' | 'search' | 'git' | 'tags' | 'extensions'

/** Right popout views (controlled by the compact top-right action menu). */
export type RightView = 'outline' | 'backlinks' | 'properties' | 'assistant'

export const fileTree: FileNode[] = [
  {
    id: 'vault',
    name: 'thinkbrain-vault',
    type: 'folder',
    children: [
      {
        id: 'daily',
        name: 'Daily Notes',
        type: 'folder',
        icon: Folder,
        children: [
          { id: 'd1', name: '2026-07-14.md', type: 'file', icon: FileText, badge: '3' },
          { id: 'd2', name: '2026-07-13.md', type: 'file', icon: FileText },
          { id: 'd3', name: '2026-07-12.md', type: 'file', icon: FileText },
        ],
      },
      {
        id: 'projects',
        name: 'Projects',
        type: 'folder',
        icon: Folder,
        children: [
          {
            id: 'p-tb',
            name: 'ThinkBrain',
            type: 'folder',
            icon: FolderOpen,
            children: [
              { id: 'p1', name: 'Architecture.md', type: 'file', icon: FileText },
              { id: 'p2', name: 'Roadmap.md', type: 'file', icon: FileText, badge: 'M' },
              { id: 'p3', name: 'MOC — Index.md', type: 'file', icon: FileText },
            ],
          },
          {
            id: 'p-ws',
            name: 'Website Redesign',
            type: 'folder',
            icon: Folder,
            children: [
              { id: 'w1', name: 'Brief.md', type: 'file', icon: FileText },
              { id: 'w2', name: 'Wireframes.md', type: 'file', icon: FileText },
            ],
          },
        ],
      },
      {
        id: 'concepts',
        name: 'Concepts',
        type: 'folder',
        icon: Folder,
        children: [
          { id: 'c1', name: 'Zettelkasten.md', type: 'file', icon: FileText },
          { id: 'c2', name: 'Spaced Repetition.md', type: 'file', icon: FileText },
          { id: 'c3', name: 'MOC — Learning.md', type: 'file', icon: FileText },
        ],
      },
      {
        id: 'resources',
        name: 'Resources',
        type: 'folder',
        icon: Folder,
        children: [
          { id: 'r1', name: 'Reading List.md', type: 'file', icon: FileText },
          { id: 'r2', name: 'research-notes.md', type: 'file', icon: FileText },
        ],
      },
      { id: 'inbox', name: 'Inbox.md', type: 'file', icon: FileText, badge: '12' },
      { id: 'templates', name: 'Templates', type: 'folder', icon: Folder },
    ],
  },
]

export const initialTabs: Tab[] = [
  {
    id: 'tab-arch',
    title: 'Architecture.md',
    kind: 'editor',
    icon: FileText,
    path: 'Projects/ThinkBrain/Architecture.md',
    dirty: true,
  },
  {
    id: 'tab-roadmap',
    title: 'Roadmap.md',
    kind: 'editor',
    icon: FileText,
    path: 'Projects/ThinkBrain/Roadmap.md',
  },
  {
    id: 'tab-browser',
    title: 'zettelkasten.de',
    kind: 'browser',
    icon: Globe,
    path: 'https://zettelkasten.de',
  },
  {
    id: 'tab-graph',
    title: 'Graph',
    kind: 'graph',
    icon: Brain,
    path: 'Vault Graph',
  },
  {
    id: 'tab-preview',
    title: 'Preview: Roadmap',
    kind: 'preview',
    icon: FileText,
    path: 'Projects/ThinkBrain/Roadmap.md',
  },
]

/** Outline headings for the current note. */
export const outline = [
  { id: 'h1', level: 1, text: 'Architecture Overview' },
  { id: 'h2', level: 2, text: 'Core Principles' },
  { id: 'h3', level: 3, text: 'Local-first storage' },
  { id: 'h3', level: 3, text: 'Plugin extensibility' },
  { id: 'h2', level: 2, text: 'System Layers' },
  { id: 'h3', level: 3, text: 'Editor layer' },
  { id: 'h3', level: 3, text: 'Indexing & search' },
  { id: 'h3', level: 3, text: 'Sync & collaboration' },
  { id: 'h2', level: 2, text: 'Open Questions' },
]

/** Backlinks to the current note. */
export const backlinks = [
  { id: 'b1', title: 'Roadmap.md', snippet: '…depends on the Architecture decisions around local-first…' },
  { id: 'b2', title: 'MOC — Index.md', snippet: 'See Architecture for the layered breakdown.' },
  { id: 'b3', title: 'Daily 2026-07-12.md', snippet: 'Refined the plugin model per Architecture §Core Principles.' },
  { id: 'b4', title: 'Plugin Extensibility.md', snippet: 'Hooks defined in Architecture → System Layers.' },
]

/** Frontmatter / properties for the current note. */
export const properties = [
  { key: 'title', value: 'Architecture Overview' },
  { key: 'created', value: '2026-06-28' },
  { key: 'modified', value: '2026-07-14' },
  { key: 'tags', value: '#architecture #core #design' },
  { key: 'status', value: 'in-progress' },
  { key: 'aliases', value: 'System Design' },
]

/** Sample editor content (Markdown source shown in the CodeMirror-style view). */
export const editorContent = `# Architecture Overview

A high-level breakdown of how ThinkBrain is layered.
Local-first, plugin-extensible, and built around a **graph of notes**.

## Core Principles

### Local-first storage
All notes live as plain Markdown files on disk. The app is a
viewer/editor over that folder — never the source of truth.

### Plugin extensibility
Every surface (editor, sidebar, command palette, status bar) exposes
contribution points that plugins can hook into.

## System Layers

### Editor layer
CodeMirror 6 powers the text editor. Tabs can host *any* content type
though — a browser, a graph view, a rendered preview.

### Indexing & search
A background indexer maintains a full-text + trigram index for
instant search across the whole vault.

### Sync & collaboration
Optional sync layer; conflict-free via CRDTs. Collaboration is a
future extension point.

## Open Questions
- How do plugins declare their own tab content types?
- Should the graph view be a first-class tab or a panel?
`

/** AI assistant conversation seed. */
export const assistantMessages = [
  {
    id: 'm1',
    role: 'assistant' as const,
    text: "I've summarized the Architecture note. It describes a local-first, plugin-extensible notes app with three layers: editor, indexing, and sync. Want me to draft the Roadmap from it?",
  },
  {
    id: 'm2',
    role: 'user' as const,
    text: 'Yes, and surface the open questions as TODO items.',
  },
  {
    id: 'm3',
    role: 'assistant' as const,
    text: 'Done. I added 2 TODOs to Roadmap.md under "Open Questions" and created backlinks from each to Architecture.md §Open Questions.',
  },
]

/** Search results across the vault. */
export const searchResults = [
  { id: 's1', file: 'Architecture.md', line: 12, text: '…**local-first storage** — notes are plain Markdown on disk…' },
  { id: 's2', file: 'Roadmap.md', line: 4, text: 'Milestone 1: local-first MVP, no sync.' },
  { id: 's3', file: 'Daily 2026-07-12.md', line: 22, text: 'Confirmed local-first is non-negotiable.' },
  { id: 's4', file: 'Zettelkasten.md', line: 8, text: '…permanent notes, local-first by nature…' },
  { id: 's5', file: 'research-notes.md', line: 41, text: 'Compare local-first vs cloud-first tradeoffs.' },
]

/** Activity-bar items (left). */
export const activityItems: { id: LeftView; icon: LucideIcon; label: string }[] = [
  { id: 'explorer', icon: FileText, label: 'Explorer' },
  { id: 'search', icon: Search, label: 'Search' },
  { id: 'git', icon: GitBranch, label: 'Source Control' },
  { id: 'tags', icon: Hash, label: 'Tags' },
  { id: 'extensions', icon: Sparkles, label: 'Extensions' },
]

/** Right popout action items (compact top-right menu). */
export const rightActionItems: { id: RightView; icon: LucideIcon; label: string }[] = [
  { id: 'outline', icon: Hash, label: 'Outline' },
  { id: 'backlinks', icon: FileText, label: 'Backlinks' },
  { id: 'properties', icon: Settings, label: 'Properties' },
  { id: 'assistant', icon: Brain, label: 'AI Assistant' },
]
