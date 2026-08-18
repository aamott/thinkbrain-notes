import { useLeftPanelContributions } from "../panels/panelRegistry";
import { IconButton } from "./IconButton";
import { type LeftPanel } from "./shellTypes";

/**
 * Vertical activity bar rendered on the far left of the desktop shell.
 *
 * Shows the primary workspace section switchers (explorer, search, source
 * control, tags, extensions) at the top and the settings entry point at the
 * bottom. The active left panel is highlighted via the `IconButton` accent.
 */
type ActivityBarProps = {
  /** Currently selected left panel, or `null` when none is open. */
  readonly leftPanel: LeftPanel | null;
  /** Switches the active left panel to the given id. */
  readonly onSelectLeftPanel: (panel: LeftPanel) => void;
  /** Opens the settings entry point. */
  readonly onOpenSettings: () => void;
  /** Counts to show over panel icons, keyed by panel id. */
  readonly badges?: Readonly<Record<string, number>>;
};

export function ActivityBar({
  leftPanel,
  onSelectLeftPanel,
  onOpenSettings,
  badges
}: ActivityBarProps) {
  const leftPanels = useLeftPanelContributions();

  return (
    <aside
      className="flex flex-col justify-between flex-[0_0_3rem] bg-activitybar border-r border-border py-[0.4rem]"
      aria-label="Workspace sections"
    >
      <div>
        {leftPanels.map((action) => (
          <IconButton
            key={action.id}
            label={action.label}
            symbol={action.icon}
            active={leftPanel === action.id}
            badge={badges?.[action.id]}
            onClick={() => onSelectLeftPanel(action.id)}
          />
        ))}
      </div>
      <div>
        <IconButton label="Settings" symbol="settings" onClick={onOpenSettings} />
      </div>
    </aside>
  );
}
