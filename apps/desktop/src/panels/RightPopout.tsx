import { type RightPanel } from "../shell/shellTypes";
import { Popout } from "./Popout";
import { useRightPanelContributions, type RightPanelContext } from "./panelRegistryModel";

type RightPopoutProps = {
  /** Currently active right activity bar panel. */
  readonly panel: RightPanel;
  /** The right-side context the shell already built for this document. */
  readonly context: RightPanelContext;
  /** Optional leading Back control: closes the dock on desktop, steps the mobile inspector flow back. */
  readonly onBack?: () => void;
};

/**
 * Right dock popout for the desktop shell. Layout and contribution rendering
 * live in the shared `Popout`; the context arrives ready-built so the dock,
 * the phone inspector sheet and the action-items menu cannot disagree about
 * what "the active document" is.
 */
export function RightPopout({ panel, context, onBack }: RightPopoutProps) {
  const rightPanels = useRightPanelContributions();
  return <Popout side="right" panel={panel} context={context} contributions={rightPanels} onBack={onBack} />;
}
