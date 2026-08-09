import { memo, useMemo } from "react";
import { cn } from "../lib/utils";
import { type RightPanel } from "../shell/shellTypes";
import { Unavailable } from "../shell/Unavailable";
import { PanelTitle } from "./PanelTitle";
import {
  getDesktopPanelOrUndefined,
  useRightPanelContributions,
  type RightPanelContribution,
  type RightPanelContext
} from "./panelRegistry";

type RightPopoutProps = {
  /** Currently active right activity bar panel. */
  readonly panel: RightPanel;
  /** Current workspace root, or `null` before a workspace is opened. */
  readonly rootPath: string | null;
  /** Markdown contents of the active editor tab, when its document is ready. */
  readonly documentContents: string | null;
};

/**
 * Right dock popout for the desktop shell.
 *
 * Stateful inspector contributions remain mounted through activity-bar switches;
 * the registry supplies their React factories while this component preserves the
 * fixed-width dock and responsive overlay behavior.
 */
export function RightPopout({ panel, rootPath, documentContents }: RightPopoutProps) {
  const rightPanels = useRightPanelContributions();
  const contribution = getDesktopPanelOrUndefined(panel);
  // Stable across parent renders, for the same reason as `LeftPopout`: a fresh
  // object re-renders every kept-mounted panel, and the outline and properties
  // panels re-read the whole document when they render. Only the right-side
  // state is constructed here — no fabricated explorer/search state, so a right
  // factory cannot silently call a no-op explorer/search callback.
  const context: RightPanelContext = useMemo(
    () => ({ rootPath, documentContents }),
    [rootPath, documentContents]
  );

  if (!contribution) {
    return (
      <aside
        className="flex flex-col min-w-0 overflow-hidden bg-sidebar border-l border-border flex-[0_0_var(--tn-shell-right-width)] max-[760px]:absolute max-[760px]:top-0 max-[760px]:bottom-0 max-[760px]:right-0 max-[760px]:z-30 max-[760px]:overflow-visible max-[760px]:shadow-panel"
        aria-label="Panel not available"
      >
        <Unavailable
          title="Panel not available"
          description={`Panel '${panel}' is not registered.`}
        />
      </aside>
    );
  }

  return (
    <aside
      className="flex flex-col min-w-0 overflow-hidden bg-sidebar border-l border-border flex-[0_0_var(--tn-shell-right-width)] max-[760px]:absolute max-[760px]:top-0 max-[760px]:bottom-0 max-[760px]:right-0 max-[760px]:z-30 max-[760px]:shadow-lg"
      aria-label={`${contribution.label} panel`}
    >
      <PanelTitle title={contribution.label} actions={contribution.actions} />
      {rightPanels.map((panelContribution) => {
        const isActive = panelContribution.id === panel;
        if (!isActive && !panelContribution.keepMounted) return null;
        const isAvailable = panelContribution.availability?.(context) ?? true;
        return (
          <MountedPanel
            key={panelContribution.id}
            contribution={panelContribution}
            context={context}
            isActive={isActive}
            isAvailable={isAvailable}
          />
        );
      })}
    </aside>
  );
}

/**
 * One panel's slot.
 *
 * Memoized so switching popouts re-renders only the panel that changed. A
 * kept-mounted panel keeps its DOM and its state; it just stops re-rendering
 * when its neighbour is the one being opened. Mirrors `LeftPopout`'s slot.
 */
const MountedPanel = memo(function MountedPanel({
  contribution,
  context,
  isActive,
  isAvailable
}: {
  readonly contribution: RightPanelContribution;
  readonly context: RightPanelContext;
  readonly isActive: boolean;
  readonly isAvailable: boolean;
}) {
  return (
    <div
      className={cn("flex min-h-0 flex-1 flex-col", !isActive && "hidden")}
      data-panel-available={isAvailable}
    >
      {contribution.factory(context)}
    </div>
  );
});
