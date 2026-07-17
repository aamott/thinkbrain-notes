import { useEffect, useState, type CSSProperties } from 'react'
import { ActionBar } from '@/components/ActionBar'
import { LeftPopout } from '@/components/LeftPopout'
import { RightPopout } from '@/components/RightPopout'
import { TitleBar } from '@/components/TitleBar'
import { EditorArea } from '@/components/EditorArea'
import { StatusBar } from '@/components/StatusBar'
import { BottomPanel } from '@/components/BottomPanel'
import { CommandPalette } from '@/components/CommandPalette'
import { ResizeHandle } from '@/components/ResizeHandle'
import { initialTabs, type LeftView, type RightView, type Tab } from '@/data/mockData'

/**
 * App shell — a coding-app-style notes editor.
 *
 * Layout (top to bottom, left to right):
 *   TitleBar (tabs + right-action menu + window controls)
 *   ┌ ActionBar │ LeftPopout │ EditorArea │ RightPopout ┐
 *   │           │            │            │             │
 *   │           │            │  BottomPanel (toggle)   │
 *   StatusBar
 */
export default function App() {
  const [tabs, setTabs] = useState<Tab[]>(initialTabs)
  const [activeTabId, setActiveTabId] = useState(initialTabs[0].id)
  const [leftView, setLeftView] = useState<LeftView | null>('explorer')
  const [rightView, setRightView] = useState<RightView | null>('outline')
  const [bottomOpen, setBottomOpen] = useState(false)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [leftWidth, setLeftWidth] = useState(256)
  const [rightWidth, setRightWidth] = useState(288)

  // Global keyboard shortcuts.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Command palette: Ctrl+Shift+P or Ctrl+P
      if ((e.ctrlKey || e.metaKey) && (e.key === 'p' || e.key === 'P')) {
        e.preventDefault()
        setPaletteOpen((o) => !o)
      }
      // Toggle bottom panel: Ctrl+J
      if ((e.ctrlKey || e.metaKey) && e.key === 'j') {
        e.preventDefault()
        setBottomOpen((o) => !o)
      }
      // Toggle left sidebar: Ctrl+B
      if ((e.ctrlKey || e.metaKey) && e.key === 'b') {
        e.preventDefault()
        setLeftView((v) => (v ? null : 'explorer'))
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  const activeTab = tabs.find((t) => t.id === activeTabId) ?? tabs[0]

  const handleSelectLeft = (view: LeftView) =>
    setLeftView((v) => (v === view ? null : view))

  const handleToggleRight = (view: RightView) =>
    setRightView((v) => (v === view ? null : view))

  const handleCloseTab = (id: string) => {
    const closingActive = id === activeTabId
    const next = tabs.filter((t) => t.id !== id)
    setTabs(next)
    // If we closed the active tab, pick the new neighbor (or clear).
    if (closingActive) {
      setActiveTabId(next.length > 0 ? next[0].id : '')
    }
  }

  return (
    <div
      className="flex h-screen w-screen flex-col overflow-hidden bg-background text-foreground"
      style={{
        '--sidebar-w': leftView ? `${leftWidth}px` : '0rem',
        '--right-sidebar-w': rightView ? `${rightWidth}px` : '0rem',
      } as CSSProperties}
    >
      <TitleBar
        tabs={tabs}
        activeTabId={activeTabId}
        onSelectTab={setActiveTabId}
        onCloseTab={handleCloseTab}
        rightView={rightView}
        onToggleRight={handleToggleRight}
      />

      {/* Main row: action bar + sidebars + editor */}
      <div className="flex min-h-0 flex-1">
        <ActionBar active={leftView} onSelect={handleSelectLeft} />

        {leftView && (
          <>
            <LeftPopout view={leftView} />
            <ResizeHandle
              side="left"
              width={leftWidth}
              onResize={setLeftWidth}
            />
          </>
        )}

        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex min-h-0 flex-1">
            {activeTab ? (
              <EditorArea tab={activeTab} />
            ) : (
              <EmptyEditor />
            )}
            {rightView && (
              <>
                <ResizeHandle
                  side="right"
                  width={rightWidth}
                  onResize={setRightWidth}
                />
                <RightPopout view={rightView} />
              </>
            )}
          </div>
          {bottomOpen && <BottomPanel onClose={() => setBottomOpen(false)} />}
        </div>
      </div>

      <StatusBar
        language={activeTab?.kind === 'browser' ? 'Web' : 'Markdown'}
        line={42}
        col={16}
        vaultName="thinkbrain-vault"
        bottomPanelOpen={bottomOpen}
        onToggleBottomPanel={() => setBottomOpen((o) => !o)}
      />

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />

      {/* Floating hint badge for keyboard shortcuts */}
      <ShortcutsHint onOpen={() => setPaletteOpen(true)} />
    </div>
  )
}

/** Small floating button hinting at the command palette. */
function ShortcutsHint({ onOpen }: { onOpen: () => void }) {
  return (
    <button
      onClick={onOpen}
      className="fixed bottom-8 right-3 z-10 flex items-center gap-1.5 rounded-full border border-border bg-card/90 px-2.5 py-1 text-[11px] text-muted-foreground shadow-lg backdrop-blur hover:text-foreground"
    >
      <kbd className="font-sans">Ctrl</kbd>
      <span>+</span>
      <kbd className="font-sans">P</kbd>
    </button>
  )
}

/** Placeholder shown when all tabs are closed. */
function EmptyEditor() {
  return (
    <div className="flex h-full flex-1 items-center justify-center bg-editor text-muted-foreground">
      <div className="flex flex-col items-center gap-2">
        <span className="text-sm">No tabs open</span>
        <span className="text-xs">Press Ctrl+P to open a file</span>
      </div>
    </div>
  )
}
