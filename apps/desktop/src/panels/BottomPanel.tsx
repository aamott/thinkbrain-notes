import type { BottomPanel as BottomPanelId } from "../shell/shellTypes";
import { Unavailable } from "../shell/Unavailable";

type BottomPanelProps = {
  readonly active: BottomPanelId;
  readonly onClose: () => void;
};

/**
 * Native terminal execution is gated on Agent Client Protocol capability work,
 * so the panel renders an honest unavailable boundary rather than exposing
 * execution controls that aren't backed by anything yet.
 */
const TERMINAL_UNAVAILABLE =
  "Terminal unavailable. Native terminal execution requires ACP capability work.";

/**
 * Bottom dock surface extracted from DesktopShell.
 *
 * Terminal is the only wired surface, so the strip renders its one selected
 * tab — no selection machinery — plus a close button and the tab's content.
 */
export function BottomPanel({ active, onClose }: BottomPanelProps) {
  const tabId = `bottom-panel-tab-${active}`;
  const contentId = `bottom-panel-content-${active}`;

  return (
    <section className="flex-[0_0_12rem] min-h-28 min-w-0 overflow-hidden border-t border-border bg-panel motion-reduce:transition-none" aria-label="Bottom panel">
      <div className="flex h-8 min-w-0 items-center overflow-x-auto border-b border-border" role="tablist" aria-label="Bottom panel tabs">
        <button
          id={tabId}
          className="h-full shrink-0 border-0 border-b-2 border-b-primary bg-transparent px-[0.7rem] text-[0.65rem] tracking-wider text-foreground uppercase"
          type="button"
          role="tab"
          aria-controls={contentId}
          aria-selected="true"
        >
          {active}
        </button>
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
      <div id={contentId} className="h-[calc(100%-2rem)] overflow-auto p-[0.65rem_0.85rem] font-mono text-xs leading-1.6" role="tabpanel" aria-labelledby={tabId}>
        {/* Terminal is the only wired surface today; render its capability boundary directly. */}
        <Unavailable className="items-start justify-start p-0 text-left" title="Terminal" description={TERMINAL_UNAVAILABLE} />
      </div>
    </section>
  );
}
