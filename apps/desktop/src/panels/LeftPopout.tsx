import { memo, useMemo } from "react";

import { type LeftPanel } from "../shell/shellTypes";
import { Unavailable } from "../shell/Unavailable";
import type { WorkspaceExplorerProps } from "../workspace/WorkspaceExplorer";
import { PanelTitle } from "./PanelTitle";
import {
  getDesktopPanelOrUndefined,
  renderDesktopPanel,
  useLeftPanelContributions,
  type DesktopPanelContext,
  type DesktopPanelContribution
} from "./panelRegistry";

type LeftPopoutProps = {
  readonly panel: LeftPanel;
  readonly rootPath: string | null;
  readonly explorerProps: WorkspaceExplorerProps;
  /** Called when a search result is activated. */
  readonly onOpenSearchResult: (relativePath: string) => void;
};

/**
 * Left dock popout for the desktop shell.
 *
 * Stateful contributions are kept mounted and toggled via `hidden`; lightweight
 * contributions are rendered only while active. The registry owns each panel's
 * title, unavailable copy, and React render factory.
 */
export function LeftPopout({ panel, rootPath, explorerProps, onOpenSearchResult }: LeftPopoutProps) {
  // Stable across panel switches: a fresh object here would re-render every
  // kept-mounted panel — the file tree and Git status included — each time the
  // user opens a different popout.
  const context: DesktopPanelContext = useMemo(
    () => ({ rootPath, documentContents: null, explorerProps, onOpenSearchResult }),
    [rootPath, explorerProps, onOpenSearchResult]
  );
  const leftPanels = useLeftPanelContributions();
  const contribution = getDesktopPanelOrUndefined(panel);

  if (!contribution) {
    return (
      <aside
        className="flex flex-col min-w-0 overflow-hidden bg-sidebar border-r border-border flex-[0_0_var(--tn-shell-left-width)] max-[760px]:absolute max-[760px]:top-0 max-[760px]:bottom-0 max-[760px]:left-[var(--tn-size-activitybar-width)] max-[760px]:z-30 max-[760px]:overflow-visible max-[760px]:shadow-panel-left"
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
      className="flex flex-col min-w-0 overflow-hidden bg-sidebar border-r border-border flex-[0_0_var(--tn-shell-left-width)] max-[760px]:absolute max-[760px]:top-0 max-[760px]:bottom-0 max-[760px]:left-[var(--tn-size-activitybar-width)] max-[760px]:z-30 max-[760px]:shadow-lg"
      aria-label={`${contribution.label} panel`}
    >
      <PanelTitle title={contribution.label} actions={contribution.actions} />
      {leftPanels.map((panelContribution) => {
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
 * when its neighbour is the one being opened.
 */
const MountedPanel = memo(function MountedPanel({
  contribution,
  context,
  isActive,
  isAvailable
}: {
  readonly contribution: DesktopPanelContribution;
  readonly context: DesktopPanelContext;
  readonly isActive: boolean;
  readonly isAvailable: boolean;
}) {
  return (
    <div
      className={isActive ? "flex flex-col flex-1 min-h-0" : "hidden"}
      data-panel-available={isAvailable}
    >
      {renderDesktopPanel(contribution, context)}
    </div>
  );
});
