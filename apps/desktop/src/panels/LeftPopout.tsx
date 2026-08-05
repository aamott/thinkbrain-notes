import type { NativeWorkspaceSnapshot } from "../native/commands";
import { SourceControlPanel } from "../git/SourceControlPanel";
import { SearchPanel } from "../search/SearchPanel";
import { Unavailable } from "../shell/Unavailable";
import { WorkspaceExplorer } from "../workspace/WorkspaceExplorer";
import { type LeftPanel, leftActions } from "../shell/shellTypes";
import { PanelTitle } from "./PanelTitle";

/**
 * Props forwarded to {@link WorkspaceExplorer} when the active left panel is
 * the workspace explorer.
 */
type ExplorerProps = {
  readonly initialWorkspacePath: string | null;
  readonly onWorkspaceOpened: (rootPath: string, snapshot: NativeWorkspaceSnapshot) => void;
  readonly onWorkspaceUnavailable: () => void;
  readonly onMarkdownFileSelected: (rootPath: string, relativePath: string) => void;
  readonly onMarkdownFileCreated: (rootPath: string, relativePath: string) => void;
  readonly onNewNoteFocusHandled: () => void;
  readonly newNoteFocusRequest: number;
  readonly recentWorkspacePaths: readonly string[];
  readonly onWorkspaceLaunched: (rootPath: string) => void;
};

type LeftPopoutProps = {
  readonly panel: LeftPanel;
  readonly rootPath: string | null;
  readonly explorerProps: ExplorerProps;
  /** Called when a search result is activated. */
  readonly onOpenSearchResult: (relativePath: string) => void;
};

/**
 * Left dock popout for the desktop shell.
 *
 * Heavy panels (explorer, source control) are kept mounted at all times and
 * toggled via `hidden` so their loaded state survives panel switches. Lightweight
 * panels (search, tags, extensions) are rendered conditionally.
 */
export function LeftPopout({ panel, rootPath, explorerProps, onOpenSearchResult }: LeftPopoutProps) {
  const label = leftActions.find((item) => item.id === panel)?.label ?? "Panel";

  return (
    <aside
      className="flex flex-col min-w-0 overflow-hidden bg-sidebar border-r border-border flex-[0_0_var(--tn-shell-left-width)] max-[760px]:absolute max-[760px]:z-[2]"
      aria-label={`${label} panel`}
    >
      {/*
       * Explorer: kept mounted to preserve loaded files, expanded folders, and
       * scroll position when the user switches to another activity bar panel.
       * The wrapper fills the aside when visible and collapses when hidden.
       */}
      <div className={panel === "explorer" ? "flex flex-col flex-1 min-h-0" : "hidden"}>
        <WorkspaceExplorer {...explorerProps} />
      </div>

      {/*
       * Source control: kept mounted to preserve loaded git status across panel
       * switches. Renders its own PanelTitle header inside the keep-alive wrapper.
       */}
      <div className={panel === "source-control" ? "flex flex-col flex-1 min-h-0" : "hidden"}>
        <PanelTitle title="Source control" />
        <SourceControlPanel rootPath={rootPath} />
      </div>

      {/*
       * Lightweight panels: rendered only when active. Search has minimal state
       * (a query string); tags and extensions are unavailable placeholders.
       */}
      {panel === "search" && (
        <>
          <PanelTitle title={label} />
          <SearchPanel rootPath={rootPath} onOpenFile={onOpenSearchResult} />
        </>
      )}
      {(panel === "tags" || panel === "extensions") && (
        <>
          <PanelTitle title={label} />
          <Unavailable
            title={panel}
            description={
              panel === "tags"
                ? "Tags will appear here once note indexing is available."
                : panel === "extensions"
                  ? "Extensions will appear here when the capability sandbox is ready."
                  : "This workspace surface is not connected yet."
            }
          />
        </>
      )}
    </aside>
  );
}
