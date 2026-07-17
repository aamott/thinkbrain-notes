import {
  GitBranch,
  Check,
  AlertCircle,
  Bell,
  Wifi,
  Brain,
  Columns2,
  PanelBottom,
} from 'lucide-react'
import { cn } from '@/lib/utils'

type Props = {
  language: string
  line: number
  col: number
  vaultName: string
  bottomPanelOpen: boolean
  onToggleBottomPanel: () => void
}

/** Bottom status bar (VS Code-style, branded purple). */
export function StatusBar({
  language,
  line,
  col,
  vaultName,
  bottomPanelOpen,
  onToggleBottomPanel,
}: Props) {
  return (
    <div className="flex h-6 shrink-0 items-center justify-between bg-statusbar px-2 text-[11px] text-statusbar-foreground">
      {/* Left */}
      <div className="flex items-center gap-3">
        <button className="flex items-center gap-1 hover:bg-white/15 rounded px-1 py-0.5">
          <GitBranch className="size-3.5" />
          main
        </button>
        <button className="flex items-center gap-1 hover:bg-white/15 rounded px-1 py-0.5">
          <Check className="size-3.5" />
          0
          <AlertCircle className="size-3.5" />
          2
        </button>
        <button className="flex items-center gap-1 hover:bg-white/15 rounded px-1 py-0.5">
          <Brain className="size-3.5" />
          Indexer ready
        </button>
      </div>

      {/* Right */}
      <div className="flex items-center gap-3">
        <span>{vaultName}</span>
        <span className="opacity-70">Ln {line}, Col {col}</span>
        <span>Spaces: 2</span>
        <span>UTF-8</span>
        <span>{language}</span>
        <button className="flex items-center hover:bg-white/15 rounded px-1 py-0.5">
          <Columns2 className="size-3.5" />
        </button>
        <button
          onClick={onToggleBottomPanel}
          className={cn(
            'flex items-center rounded px-1 py-0.5 hover:bg-white/15',
            bottomPanelOpen && 'bg-white/15',
          )}
        >
          <PanelBottom className="size-3.5" />
        </button>
        <button className="flex items-center hover:bg-white/15 rounded px-1 py-0.5">
          <Wifi className="size-3.5" />
        </button>
        <button className="flex items-center hover:bg-white/15 rounded px-1 py-0.5">
          <Bell className="size-3.5" />
        </button>
      </div>
    </div>
  )
}
