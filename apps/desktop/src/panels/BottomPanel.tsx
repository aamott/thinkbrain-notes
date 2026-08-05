import { cn } from "../lib/utils";
import type { BottomPanel as BottomPanelId } from "../shell/shellTypes";
import { Unavailable } from "../shell/Unavailable";

/**
 * Props for the bottom dock panel.
 */
type BottomPanelProps = {
  readonly active: BottomPanelId;
  readonly onChange: (panel: BottomPanelId) => void;
  readonly onClose: () => void;
};

/** Bottom dock tab ids, in display order. */
const bottomPanelItems = ["problems", "output", "terminal", "backlinks"] as const;

/**
 * Bottom dock surface extracted from DesktopShell.
 *
 * Renders a tab strip (problems / output / terminal / backlinks), a close
 * button, and a content area. The content currently shows an `Unavailable`
 * placeholder until each panel's backing service is wired up.
 */
export function BottomPanel({ active, onChange, onClose }: BottomPanelProps) {
  return (
    <section className="flex-[0_0_12rem] min-h-[7rem] bg-panel border-t border-border" aria-label="Bottom panel">
      <div className="flex items-center h-8 border-b border-border">
        {bottomPanelItems.map((item) => (
          <button
            key={item}
            className={cn(
              "bg-transparent border-0 cursor-pointer text-[0.65rem] h-full tracking-[0.05em] px-[0.7rem] uppercase text-muted-foreground hover:border-b-2 hover:border-b-primary hover:text-foreground",
              active === item && "border-b-2 border-b-primary text-foreground"
            )}
            onClick={() => onChange(item)}
          >
            {item}
          </button>
        ))}
        <span className="flex-1" />
        <button
          className="bg-transparent border-0 cursor-pointer text-muted-foreground text-sm px-2 hover:text-foreground"
          onClick={onClose}
          aria-label="Close bottom panel"
        >
          ×
        </button>
      </div>
      <div className="h-[calc(100%-2rem)] overflow-auto p-[0.65rem_0.85rem] font-mono text-xs leading-[1.6]">
        <Unavailable
          className="items-start justify-start p-0 text-left"
          title={`${active} panel`}
          description="This panel is waiting for its backing service."
        />
      </div>
    </section>
  );
}
