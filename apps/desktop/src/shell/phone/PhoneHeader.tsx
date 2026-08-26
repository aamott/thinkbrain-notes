import { ArrowLeft, Menu as MenuIcon, MoreHorizontal } from "lucide-react";

/**
 * Universal phone header.
 *
 * The two right-hand controls open different surfaces: the count opens the tab
 * switcher, `⋯` opens the inspector sheet. Only the left slot and the hub's Menu
 * slot open the navigation drawer.
 */
export function PhoneHeader({
  title,
  canGoBack,
  tabCount,
  onBack,
  onOpenNavigation,
  onOpenTabs,
  onOpenInspector
}: {
  readonly title: string;
  readonly canGoBack: boolean;
  readonly tabCount: number;
  readonly onBack: () => void;
  readonly onOpenNavigation: () => void;
  readonly onOpenTabs: () => void;
  readonly onOpenInspector: () => void;
}) {
  const button =
    "flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-small border-0 bg-transparent text-titlebar-foreground focus-visible:-outline-offset-2 focus-visible:outline-2 focus-visible:outline-ring";
  return (
    <header className="flex h-14 shrink-0 items-center justify-between gap-1 border-b border-border bg-titlebar px-1 text-titlebar-foreground">
      {canGoBack ? (
        <button type="button" aria-label="Back" className={button} onClick={onBack}>
          <ArrowLeft aria-hidden="true" className="size-5" />
        </button>
      ) : (
        <button
          type="button"
          aria-label="Open navigation"
          className={button}
          onClick={onOpenNavigation}
        >
          <MenuIcon aria-hidden="true" className="size-5" />
        </button>
      )}

      <h1 className="min-w-0 flex-1 truncate text-center text-sm font-semibold">{title}</h1>

      <div className="flex shrink-0 items-center">
        <button
          type="button"
          aria-label={`Open tabs (${tabCount})`}
          className={button}
          onClick={onOpenTabs}
        >
          <span
            aria-hidden="true"
            className="flex size-6 items-center justify-center rounded-small border-2 border-current text-[0.7rem] font-bold"
          >
            {tabCount}
          </span>
        </button>
        <button
          type="button"
          aria-label="Document tools"
          className={button}
          onClick={onOpenInspector}
        >
          <MoreHorizontal aria-hidden="true" className="size-5" />
        </button>
      </div>
    </header>
  );
}
