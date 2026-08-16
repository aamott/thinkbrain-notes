import { useMemo } from "react";

import { type LeftPanel } from "../shell/shellTypes";
import type { WorkspaceExplorerProps } from "../workspace/WorkspaceExplorer";
import { Popout } from "./Popout";
import { useLeftPanelContributions, type LeftPanelContext } from "./panelRegistry";

type LeftPopoutProps = {
  readonly panel: LeftPanel;
  readonly rootPath: string | null;
  readonly explorerProps: WorkspaceExplorerProps;
  /** Called when a search result is activated. */
  readonly onOpenSearchResult: (relativePath: string) => void;
};

/**
 * Left dock popout for the desktop shell. Layout and contribution rendering
 * live in the shared `Popout`; only the left-side context is constructed here.
 */
export function LeftPopout({ panel, rootPath, explorerProps, onOpenSearchResult }: LeftPopoutProps) {
  const context: LeftPanelContext = useMemo(
    () => ({ rootPath, explorerProps, onOpenSearchResult }),
    [rootPath, explorerProps, onOpenSearchResult]
  );
  const leftPanels = useLeftPanelContributions();
  return <Popout side="left" panel={panel} context={context} contributions={leftPanels} />;
}
