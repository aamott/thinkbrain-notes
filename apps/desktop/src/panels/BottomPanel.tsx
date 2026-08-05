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

/** Bottom dock tab ids, in display order. */
const bottomPanelItems = ["problems", "output", "terminal", "backlinks"] as const satisfies readonly BottomPanelId[];

/**
 * Capability declarations for bottom-panel backing services.
 *
 * Problems and output can truthfully render their empty state without a
 * provider. Terminal and backlinks remain unavailable until their native and
 * workspace-index providers are implemented.
 */
const bottomPanelProviders: Record<BottomPanelId, BottomPanelProvider> = {
  problems: {
    id: "problems",
    isAvailable: true,
    unavailableMessage: "Diagnostics are unavailable until a diagnostics provider is connected."
  },
  output: {
    id: "output",
    isAvailable: true,
    unavailableMessage: "Output is unavailable until an indexer provider is connected."
  },
  terminal: {
    id: "terminal",
    isAvailable: false,
    unavailableMessage: "Terminal unavailable. Native terminal execution requires ACP capability work."
  },
  backlinks: {
    id: "backlinks",
    isAvailable: false,
    unavailableMessage: "Backlinks preview unavailable. This requires the workspace link index."
  }
};

/** Renders the empty diagnostics state until a diagnostics provider exists. */
function ProblemsPanel() {
  return <p className="m-0 text-muted-foreground">No problems detected</p>;
}

/** Renders the output log's empty state until the indexer publishes output. */
function OutputPanel() {
  return <p className="m-0 text-muted-foreground">No output yet. Indexer status will appear here.</p>;
}

/** Renders an honest terminal capability boundary without exposing execution controls. */
function TerminalPanel({ provider }: { readonly provider: BottomPanelProvider }) {
  return <Unavailable className="items-start justify-start p-0 text-left" title="Terminal" description={provider.unavailableMessage} />;
}

/** Renders an honest workspace-link-index capability boundary. */
function BacklinksPreviewPanel({ provider }: { readonly provider: BottomPanelProvider }) {
  return <Unavailable className="items-start justify-start p-0 text-left" title="Backlinks preview" description={provider.unavailableMessage} />;
}

/**
 * Renders content for the selected provider while honoring its availability.
 */
function BottomPanelContent({ provider }: { readonly provider: BottomPanelProvider }) {
  if (!provider.isAvailable) {
    return provider.id === "terminal"
      ? <TerminalPanel provider={provider} />
      : <BacklinksPreviewPanel provider={provider} />;
  }

  return provider.id === "problems" ? <ProblemsPanel /> : <OutputPanel />;
}

/**
 * Bottom dock surface extracted from DesktopShell.
 *
 * Renders a tab strip (problems / output / terminal / backlinks), a close
 * button, and provider-bounded content for the selected surface.
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
