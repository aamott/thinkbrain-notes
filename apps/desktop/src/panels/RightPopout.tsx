import { useMemo } from "react";
import { type RightPanel } from "../shell/shellTypes";
import { Popout } from "./Popout";
import { useRightPanelContributions, type RightPanelContext } from "./panelRegistryModel";

type RightPopoutProps = {
  /** Currently active right activity bar panel. */
  readonly panel: RightPanel;
  /** Current workspace root, or `null` before a workspace is opened. */
  readonly rootPath: string | null;
  /** Markdown contents of the active editor tab, when its document is ready. */
  readonly documentContents: string | null;
  /** Relative path of the active Markdown editor note, or `null`. */
  readonly documentPath: string | null;
  /** Requests shell-owned navigation to another note. */
  readonly onOpenNote: (relativePath: string) => void;
  /** Optional leading Back control: closes the dock on desktop, steps the mobile inspector flow back. */
  readonly onBack?: () => void;
};

/**
 * Right dock popout for the desktop shell. Layout and contribution rendering
 * live in the shared `Popout`; only the right-side context is constructed here.
 */
export function RightPopout({
  panel,
  rootPath,
  documentContents,
  documentPath,
  onOpenNote,
  onBack
}: RightPopoutProps) {
  const rightPanels = useRightPanelContributions();
  const context: RightPanelContext = useMemo(
    () => ({ rootPath, documentContents, documentPath, onOpenNote }),
    [rootPath, documentContents, documentPath, onOpenNote]
  );
  return <Popout side="right" panel={panel} context={context} contributions={rightPanels} onBack={onBack} />;
}
