import { useMemo } from "react";

import { type LeftPanel } from "../shell/shellTypes";
import type { WorkspaceExplorerProps } from "../workspace/WorkspaceExplorer";
import { Popout } from "./Popout";
import { useLeftPanelContributions, type LeftPanelContext } from "./panelRegistryModel";

type LeftPopoutProps = {
  readonly panel: LeftPanel;
  readonly rootPath: string | null;
  readonly explorerProps: WorkspaceExplorerProps;
  /** Called when a search result is activated. */
  readonly onOpenSearchResult: (relativePath: string) => void;
  /** Called when a conflict is opened for side-by-side review. */
  readonly onReviewConflict: (copyPath: string, notePath: string) => void;
  /** The note whose earlier versions the history panel should show. */
  readonly versionsOf: string | null;
  /** Called when the history panel is asked to widen back to everything. */
  readonly onShowEverything: () => void;
};

/**
 * Left dock popout for the desktop shell. Layout and contribution rendering
 * live in the shared `Popout`; only the left-side context is constructed here.
 */
export function LeftPopout({
  panel,
  rootPath,
  explorerProps,
  onOpenSearchResult,
  onReviewConflict,
  versionsOf,
  onShowEverything
}: LeftPopoutProps) {
  const context: LeftPanelContext = useMemo(
    () => ({
      rootPath,
      explorerProps,
      onOpenSearchResult,
      onReviewConflict,
      versionsOf,
      onShowEverything
    }),
    [rootPath, explorerProps, onOpenSearchResult, onReviewConflict, versionsOf, onShowEverything]
  );
  const leftPanels = useLeftPanelContributions();
  return <Popout side="left" panel={panel} context={context} contributions={leftPanels} />;
}
