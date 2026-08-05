import { cn } from "../lib/utils";
import { type RightPanel } from "../shell/shellTypes";
import { PanelTitle } from "./PanelTitle";
import {
  getDesktopPanel,
  getRightPanelContributions,
  renderDesktopPanel,
  type DesktopPanelContext
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
  const contribution = getDesktopPanel(panel);
  const context: DesktopPanelContext = {
    rootPath,
    documentContents,
    explorerProps: {
      initialWorkspacePath: null,
      onWorkspaceOpened: () => undefined,
      onWorkspaceUnavailable: () => undefined,
      onMarkdownFileSelected: () => undefined,
      onMarkdownFileCreated: () => undefined,
      onNewNoteFocusHandled: () => undefined,
      newNoteFocusRequest: 0,
      recentWorkspacePaths: [],
      onWorkspaceLaunched: () => undefined
    },
    onOpenSearchResult: () => undefined
  };

  return (
    <aside
      className="flex flex-col min-w-0 overflow-hidden bg-sidebar border-l border-border flex-[0_0_var(--tn-shell-right-width)] max-[760px]:absolute max-[760px]:z-[2]"
      aria-label={`${contribution.label} panel`}
    >
      <PanelTitle title={contribution.label} />
      {getRightPanelContributions().map((panelContribution) => {
        const isActive = panelContribution.id === panel;
        if (!isActive && !panelContribution.keepMounted) return null;
        const isAvailable = panelContribution.availability?.(context) ?? true;
        return (
          <div
            key={panelContribution.id}
            className={cn("flex min-h-0 flex-1 flex-col", !isActive && "hidden")}
            data-panel-available={isAvailable}
          >
            {renderDesktopPanel(panelContribution, context)}
          </div>
        );
      })}
    </aside>
  );
}
