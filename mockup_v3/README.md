# ThinkBrain — Mockup v3

A coding-app-style notes app mockup. Built with React + Vite + Tailwind CSS v4.

## Run

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # production build to dist/
```

## Layout

```
┌──────────────────────────────────────────────────────────────┐
│ TitleBar: [T ThinkBrain] [tabs……] [outline|backlinks|props|AI] [theme] [_ ▢ ✕] │
├──┬──────────┬─────────────────────────────────┬──────────────┤
│A │ LeftPopout│  Breadcrumbs                    │  RightPopout │
│c │ Explorer │  ┌─────────────────────────────┐ │  Outline     │
│t │ Search   │  │                             │ │  Backlinks   │
│B │ Git      │  │   Editor / Browser /        │ │  Properties  │
│a │ Tags     │  │   Graph / Preview           │ │  AI Assistant│
│r │ Extens.  │  │   (varies per tab)          │ │              │
│  │          │  │                             │ │              │
│  │          │  └─────────────────────────────┘ │              │
│  │          │  BottomPanel (toggle: Ctrl+J)    │              │
├──┴──────────┴─────────────────────────────────┴──────────────┤
│ StatusBar: branch · problems · indexer · vault · Ln,Col · lang │
└──────────────────────────────────────────────────────────────┘
```

### From the spec

- **Action bar (left)** — vertical icon bar; clicking toggles the left popout.
- **Status bar (bottom)** — branded purple bar with git, problems, position, language.
- **Left popout** — Explorer, Search, Source Control, Tags, Extensions (controlled by action bar).
- **Right popout** — Outline, Backlinks, Properties/frontmatter, AI Assistant (controlled by a compact icon menu in the top-right, next to window controls).
- **Tabs in the title bar** — tabs live inside the title bar; the active tab's content fills the main area.
- **Editor isn't always an editor** — tabs can render a CodeMirror-style editor, a browser view, a graph view, or a rendered preview. Try the tabs: `Architecture.md` (editor), `zettelkasten.de` (browser), `Graph` (graph), `Preview: Roadmap` (preview).

### Added beyond the spec (suggested)

- **Command palette** — `Ctrl+P` / `Ctrl+Shift+P` to run commands or jump to files.
- **Bottom panel** — Terminal / Problems / Output / Backlinks-preview, toggle with `Ctrl+J` or the status bar icon.
- **Breadcrumbs** above the editor showing the file path.
- **Theme toggle** — dark/light, persisted to localStorage. Toggle via the sun/moon icon top-right.
- **Keyboard shortcuts** — `Ctrl+B` toggle left sidebar, `Ctrl+J` toggle bottom panel, `Ctrl+P` command palette.
- **Dirty/pinned tab indicators**, minimap-ready gutter, syntax-highlighted Markdown mock.

## Tech

- Vite + React 19 + TypeScript
- Tailwind CSS v4 (`@tailwindcss/vite`, `@theme inline` token mapping)
- lucide-react icons
- Semantic color tokens with app-specific surface variables (titlebar, activitybar, sidebar, editor, panel, statusbar, tab-*) for both light and dark themes.
