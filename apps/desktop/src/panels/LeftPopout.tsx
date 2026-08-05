import { type LeftPanel } from "../shell/shellTypes";
import { Unavailable } from "../shell/Unavailable";
import type { WorkspaceExplorerProps } from "../workspace/WorkspaceExplorer";
import { PanelTitle } from "./PanelTitle";
import {
  getDesktopPanelOrUndefined,
  getLeftPanelContributions,
  renderDesktopPanel,
  type DesktopPanelContext
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
  const context: DesktopPanelContext = {
    rootPath,
    documentContents: null,
    explorerProps,
    onOpenSearchResult
  };
  const contribution = getDesktopPanelOrUndefined(panel);

  if (!contribution) {
    return (
      <aside
        className="flex flex-col min-w-0 overflow-hidden bg-sidebar border-r border-border flex-[0_0_var(--tn-shell-left-width)] max-[760px]:absolute max-[760px]:z-[2]"
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
      className="flex flex-col min-w-0 overflow-hidden bg-sidebar border-r border-border flex-[0_0_var(--tn-shell-left-width)] max-[760px]:absolute max-[760px]:z-[2]"
      aria-label={`${contribution.label} panel`}
    >
      <PanelTitle title={contribution.label} />
      {getLeftPanelContributions().map((panelContribution) => {
        const isActive = panelContribution.id === panel;
        if (!isActive && !panelContribution.keepMounted) return null;
        const isAvailable = panelContribution.availability?.(context) ?? true;
        return (
          <div
            key={panelContribution.id}
            className={isActive ? "flex flex-col flex-1 min-h-0" : "hidden"}
            data-panel-available={isAvailable}
          >
            {renderDesktopPanel(panelContribution, context)}
          </div>
        );
      })}
    </aside>
  );
}
