import {
  FileText,
  Search,
  GitBranch,
  Hash,
  Sparkles,
  Settings,
  Brain,
  type LucideIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type { LeftView } from '@/data/mockData'

type Props = {
  active: LeftView | null
  onSelect: (view: LeftView) => void
}

const topItems: { id: LeftView; icon: LucideIcon; label: string }[] = [
  { id: 'explorer', icon: FileText, label: 'Explorer' },
  { id: 'search', icon: Search, label: 'Search' },
  { id: 'git', icon: GitBranch, label: 'Source Control' },
  { id: 'tags', icon: Hash, label: 'Tags' },
  { id: 'extensions', icon: Sparkles, label: 'Extensions' },
]

/** Vertical activity bar on the far left, VS Code-style. */
export function ActionBar({ active, onSelect }: Props) {
  return (
    <div className="flex h-full w-12 flex-col items-center justify-between bg-activitybar border-r border-border">
      <div className="flex flex-col items-center gap-1 pt-2">
        {topItems.map((item) => {
          const isActive = active === item.id
          const Icon = item.icon
          return (
            <button
              key={item.id}
              onClick={() => onSelect(item.id)}
              title={item.label}
              className={cn(
                'group relative flex size-10 items-center justify-center rounded-md transition-colors',
                isActive
                  ? 'text-activitybar-active'
                  : 'text-activitybar-foreground hover:text-activitybar-active',
              )}
            >
              {isActive && (
                <span className="absolute left-0 top-1/2 h-6 w-0.5 -translate-y-1/2 rounded-full bg-activitybar-active" />
              )}
              <Icon className="size-5" />
            </button>
          )
        })}
      </div>

      <div className="flex flex-col items-center gap-1 pb-2">
        <button
          title="AI Assistant"
          className="flex size-10 items-center justify-center rounded-md text-activitybar-foreground hover:text-activitybar-active transition-colors"
        >
          <Brain className="size-5" />
        </button>
        <button
          title="Settings"
          className="flex size-10 items-center justify-center rounded-md text-activitybar-foreground hover:text-activitybar-active transition-colors"
        >
          <Settings className="size-5" />
        </button>
      </div>
    </div>
  )
}
