import { cn } from "../lib/utils";
import type { BottomPanel as BottomPanelId, BottomPanelProvider } from "../shell/shellTypes";
import { Unavailable } from "../shell/Unavailable";

/**
 * Props for the bottom dock panel.
 */
type BottomPanelProps = {
  readonly active: BottomPanelId;
  readonly onChange: (panel: BottomPanelId) => void;
  readonly onClose: () => void;
};

/** Bottom dock tab ids, in display order. Terminal is the only wired surface. */
const bottomPanelItems = ["terminal"] as const satisfies readonly BottomPanelId[];

/**
 * Capability declaration for the terminal backing service.
 *
 * Native terminal execution is gated on Agent Client Protocol capability work,
 * so the panel renders an honest unavailable boundary rather than exposing
 * execution controls that aren't backed by anything yet.
 */
const bottomPanelProviders: Record<BottomPanelId, BottomPanelProvider> = {
  terminal: {
    id: "terminal",
    isAvailable: false,
    unavailableMessage: "Terminal unavailable. Native terminal execution requires ACP capability work."
  }
};

/** Renders an honest terminal capability boundary without exposing execution controls. */
function TerminalPanel({ provider }: { readonly provider: BottomPanelProvider }) {
  return <Unavailable className="items-start justify-start p-0 text-left" title="Terminal" description={provider.unavailableMessage} />;
}

/**
 * Renders content for the selected provider while honoring its availability.
 */
function BottomPanelContent({ provider }: { readonly provider: BottomPanelProvider }) {
  return <TerminalPanel provider={provider} />;
}

/**
 * Bottom dock surface extracted from DesktopShell.
 *
 * Renders a tab strip (terminal only today, kept for future extensibility), a
 * close button, and provider-bounded content for the selected surface.
 */
export function BottomPanel({ active, onChange, onClose }: BottomPanelProps) {
  const provider = bottomPanelProviders[active];
  const tabId = `bottom-panel-tab-${active}`;
  const contentId = `bottom-panel-content-${active}`;

  return (
    <section className="flex-[0_0_12rem] min-h-[7rem] min-w-0 overflow-hidden border-t border-border bg-panel motion-reduce:transition-none" aria-label="Bottom panel">
      <div className="flex h-8 min-w-0 items-center overflow-x-auto border-b border-border" role="tablist" aria-label="Bottom panel tabs">
        {bottomPanelItems.map((item) => (
          <button
            key={item}
            id={`bottom-panel-tab-${item}`}
            className={cn(
              "h-full shrink-0 cursor-pointer border-0 border-b-2 border-b-transparent bg-transparent px-[0.7rem] text-[0.65rem] tracking-[0.05em] text-muted-foreground uppercase hover:border-b-primary hover:text-foreground",
              active === item && "border-b-primary text-foreground"
            )}
            type="button"
            role="tab"
            aria-controls={`bottom-panel-content-${item}`}
            aria-selected={active === item}
            onClick={() => onChange(item)}
          >
            {item}
          </button>
        ))}
        <span className="flex-1" />
        <button
          className="shrink-0 cursor-pointer border-0 bg-transparent px-2 text-sm text-muted-foreground hover:text-foreground"
          type="button"
          onClick={onClose}
          aria-label="Close bottom panel"
        >
          ×
        </button>
      </div>
      <div id={contentId} className="h-[calc(100%-2rem)] overflow-auto p-[0.65rem_0.85rem] font-mono text-xs leading-[1.6]" role="tabpanel" aria-labelledby={tabId}>
        <BottomPanelContent provider={provider} />
      </div>
    </section>
  );
}
