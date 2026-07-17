import { classNames } from "@thinkbrain/ui";

import type { ActivePanel } from "../stores/appStore";
import { ShellIcon, type ShellIconName } from "./icons";
import type { UnavailableFeature } from "./shellTypes";
import styles from "./ActivityBar.module.css";

interface ActivityBarProps {
  readonly activePanel: ActivePanel | null;
  readonly assistantOpen: boolean;
  readonly isPanelOpen: boolean;
  readonly onSelectPanel: (panel: ActivePanel) => void;
  readonly onToggleAssistant: () => void;
  readonly onUnavailableAction: (feature: UnavailableFeature) => void;
}

interface ActivityAction {
  readonly icon: ShellIconName;
  readonly label: string;
  readonly panel?: ActivePanel;
  readonly unavailableFeature?: UnavailableFeature;
}

const primaryActions: readonly ActivityAction[] = [
  { panel: "explorer", label: "Explorer", icon: "explorer" },
  { panel: "search", label: "Search", icon: "search" },
  { label: "Source control", icon: "sourceControl", unavailableFeature: "sourceControl" },
  { label: "Tags", icon: "tags", unavailableFeature: "tags" },
  { label: "Extensions", icon: "extensions", unavailableFeature: "extensions" }
];

export function ActivityBar({
  activePanel,
  assistantOpen,
  isPanelOpen,
  onSelectPanel,
  onToggleAssistant,
  onUnavailableAction
}: ActivityBarProps) {
  return (
    <nav className={styles.activityBar} aria-label="Primary navigation">
      <div className={styles.primaryActions}>
        {primaryActions.map((action) => {
          const isSupported = action.panel !== undefined;

          return (
            <ActivityButton
              active={isSupported && isPanelOpen && activePanel === action.panel}
              expanded={isSupported ? isPanelOpen && activePanel === action.panel : undefined}
              icon={action.icon}
              key={action.label}
              label={action.label}
              onClick={() =>
                action.panel
                  ? onSelectPanel(action.panel)
                  : onUnavailableAction(action.unavailableFeature!)
              }
              unavailable={!isSupported}
            />
          );
        })}
      </div>

      <div className={styles.secondaryActions}>
        <ActivityButton
          active={assistantOpen}
          icon="assistant"
          label="AI Assistant"
          onClick={onToggleAssistant}
        />
        <ActivityButton
          active={isPanelOpen && activePanel === "settings"}
          expanded={isPanelOpen && activePanel === "settings"}
          icon="settings"
          label="Settings"
          onClick={() => onSelectPanel("settings")}
        />
      </div>
    </nav>
  );
}

function ActivityButton({
  active = false,
  expanded,
  icon,
  label,
  onClick,
  unavailable = false
}: {
  readonly active?: boolean;
  readonly expanded?: boolean;
  readonly icon: ShellIconName;
  readonly label: string;
  readonly onClick: () => void;
  readonly unavailable?: boolean;
}) {
  return (
    <button
      aria-current={active ? "page" : undefined}
      aria-disabled={unavailable || undefined}
      aria-expanded={expanded}
      aria-label={label}
      className={classNames(styles.action, active && styles.active)}
      onClick={onClick}
      title={label}
      type="button"
    >
      <ShellIcon className={styles.icon} name={icon} />
    </button>
  );
}
