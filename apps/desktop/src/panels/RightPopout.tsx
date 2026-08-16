import { useMemo } from "react";
import { type RightPanel } from "../shell/shellTypes";
import { Popout } from "./Popout";
import { useRightPanelContributions, type RightPanelContext } from "./panelRegistry";

type RightPopoutProps = {
  /** Currently active right activity bar panel. */
  readonly panel: RightPanel;
  /** Current workspace root, or `null` before a workspace is opened. */
  readonly rootPath: string | null;
  /** Markdown contents of the active editor tab, when its document is ready. */
  readonly documentContents: string | null;
};

/**
 * Right dock popout for the desktop shell. Layout and contribution rendering
 * live in the shared `Popout`; only the right-side context is constructed here.
 */
export function RightPopout({ panel, rootPath, documentContents }: RightPopoutProps) {
  const rightPanels = useRightPanelContributions();
  const context: RightPanelContext = useMemo(
    () => ({ rootPath, documentContents }),
    [rootPath, documentContents]
  );
  return <Popout side="right" panel={panel} context={context} contributions={rightPanels} />;
}
