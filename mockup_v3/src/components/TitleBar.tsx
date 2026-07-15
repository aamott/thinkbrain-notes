import {
  Minus,
  Square,
  X,
  Plus,
  Sun,
  Moon,
  type LucideIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useTheme } from '@/components/theme-provider'
import { rightActionItems, type RightView, type Tab } from '@/data/mockData'

type Props = {
  tabs: Tab[]
  activeTabId: string
  onSelectTab: (id: string) => void
  onCloseTab: (id: string) => void
  rightView: RightView | null
  onToggleRight: (view: RightView) => void
}

/** Title bar: app icon + tabs in the center, compact right-action menu + window controls. */
export function TitleBar({
  tabs,
  activeTabId,
  onSelectTab,
  onCloseTab,
  rightView,
  onToggleRight,
}: Props) {
  const { theme, toggleTheme } = useTheme()

  return (
    <div className="flex h-9 shrink-0 items-center bg-titlebar border-b border-border">
      {/* App icon / name */}
      <div className="flex h-full shrink-0 items-center gap-2 px-3">
        <div className="flex size-4 items-center justify-center rounded-sm bg-primary">
          <span className="text-[9px] font-bold text-primary-foreground">T</span>
        </div>
        <span className="hidden text-[12px] font-medium text-titlebar-foreground sm:inline">
          ThinkBrain
        </span>
      </div>

      {/* Tabs — live inside the title bar */}
      <div className="flex h-full min-w-0 flex-1 items-end gap-0.5 overflow-x-auto scroll-thin">
        {tabs.map((tab) => {
          const isActive = tab.id === activeTabId
          const Icon = tab.icon
          return (
            <div
              key={tab.id}
              onClick={() => onSelectTab(tab.id)}
              className={cn(
                'group flex h-8 min-w-[120px] max-w-[200px] shrink-0 cursor-pointer items-center gap-2 rounded-t-md border-t-2 px-3 text-[12px] transition-colors',
                isActive
                  ? 'border-t-primary bg-tab-active text-tab-active-foreground'
                  : 'border-t-transparent bg-tab-inactive text-tab-inactive-foreground hover:bg-tab-inactive/70',
              )}
            >
              <Icon className="size-3.5 shrink-0 opacity-80" />
              <span className="truncate">{tab.title}</span>
              {tab.dirty && <span className="size-1.5 shrink-0 rounded-full bg-primary" />}
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  onCloseTab(tab.id)
                }}
                className={cn(
                  'ml-auto flex size-4 shrink-0 items-center justify-center rounded hover:bg-foreground/10',
                  isActive ? 'opacity-70' : 'opacity-0 group-hover:opacity-70',
                )}
              >
                <X className="size-3" />
              </button>
            </div>
          )
        })}
        <button className="flex h-8 w-8 shrink-0 items-center justify-center text-muted-foreground hover:text-foreground">
          <Plus className="size-4" />
        </button>
      </div>

      {/* Compact right-action menu (controls the right popout) */}
      <div className="flex h-full shrink-0 items-center gap-0.5 border-l border-border px-1">
        {rightActionItems.map((item) => {
          const Icon: LucideIcon = item.icon
          const isActive = rightView === item.id
          return (
            <button
              key={item.id}
              title={item.label}
              onClick={() => onToggleRight(item.id)}
              className={cn(
                'flex size-7 items-center justify-center rounded transition-colors',
                isActive
                  ? 'bg-accent text-primary'
                  : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground',
              )}
            >
              <Icon className="size-4" />
            </button>
          )
        })}
        <div className="mx-1 h-4 w-px bg-border" />
        <button
          title="Toggle theme"
          onClick={toggleTheme}
          className="flex size-7 items-center justify-center rounded text-muted-foreground hover:bg-accent/60 hover:text-foreground"
        >
          {theme === 'dark' ? <Sun className="size-4" /> : <Moon className="size-4" />}
        </button>
      </div>

      {/* Window controls (Linux/Windows style) */}
      <div className="flex h-full shrink-0 items-center">
        <button className="flex h-full w-11 items-center justify-center text-titlebar-foreground hover:bg-foreground/10">
          <Minus className="size-3.5" />
        </button>
        <button className="flex h-full w-11 items-center justify-center text-titlebar-foreground hover:bg-foreground/10">
          <Square className="size-3" />
        </button>
        <button className="flex h-full w-11 items-center justify-center text-titlebar-foreground hover:bg-destructive hover:text-destructive-foreground">
          <X className="size-3.5" />
        </button>
      </div>
    </div>
  )
}
