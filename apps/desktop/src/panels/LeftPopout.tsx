import type { NativeWorkspaceSnapshot } from "../native/commands";
import { SourceControlPanel } from "../git/SourceControlPanel";
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
};

/**
 * Left dock popout for the desktop shell.
 *
 * Renders the workspace explorer when the active panel is `explorer`, otherwise
 * renders a panel title header followed by the panel-specific content
 * (source control or an unavailable placeholder).
 */
export function LeftPopout({ panel, rootPath, explorerProps }: LeftPopoutProps) {
  const label = leftActions.find((item) => item.id === panel)?.label ?? "Panel";

  return (
    <aside
      className="flex flex-col min-w-0 overflow-hidden bg-sidebar border-r border-border flex-[0_0_var(--tn-shell-left-width)] max-[760px]:absolute max-[760px]:z-[2]"
      aria-label={`${label} panel`}
    >
      {panel === "explorer" ? (
        <WorkspaceExplorer {...explorerProps} />
      ) : (
        <>
          <PanelTitle title={label} />
          <LeftContent panel={panel} rootPath={rootPath} />
        </>
      )}
    </aside>
  );
}

/**
 * Body content for non-explorer left panels.
 *
 * Source control renders its dedicated panel; every other surface falls back to
 * an unavailable placeholder with a contextual description.
 */
function LeftContent({ panel, rootPath }: { panel: LeftPanel; rootPath: string | null }) {
  if (panel === "source-control") return <SourceControlPanel rootPath={rootPath} />;
  return (
    <Unavailable
      title={panel}
      description={
        panel === "extensions"
          ? "Extensions will appear here when the capability sandbox is ready."
          : "This workspace surface is not connected yet."
      }
    />
  );
}
