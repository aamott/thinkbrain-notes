import { CountBadge, Drawer } from "@thinkbrain/ui";

import { useLeftPanelContributions } from "../../panels/panelRegistryModel";
import { PanelIcon } from "../panelIcons";
import type { LeftPanel } from "../shellTypes";
import { WorkspaceSwitchingSelector } from "../../workspace/WorkspaceSwitching";

// 48px already clears the touch minimum, so no `pointer-coarse:` bump is
// needed — the same reasoning the floating bubbles record for their 48px size.
const row =
  "flex min-h-12 w-full cursor-pointer items-center gap-3 rounded-small border-0 bg-transparent px-3 text-left text-sm text-sidebar-foreground hover:bg-accent tn-focus-ring";

/**
 * The phone's navigation drawer.
 *
 * Renders `useLeftPanelContributions()` — the same source the desktop rail reads
 * — so entries, active state and badges have one definition, not two. The labels
 * the rail keeps in `aria-label` become visible text here, because a phone has
 * no hover to teach an unlabelled glyph.
 *
 * Full height — panel and scrim run to the bottom edge and cover the header:
 * the bubbles it sits over are hidden while it is open, and dismissing is a
 * scrim tap, Escape, or system Back.
 */
export function PhoneDrawer({
  open,
  activePanel,
  badges,
  onDismiss,
  onSelectPanel,
  onOpenSettings,
  onWorkspaceAction,
  currentWorkspacePath
}: {
  readonly open: boolean;
  readonly activePanel: LeftPanel | null;
  readonly badges: Readonly<Record<string, number>>;
  readonly onDismiss: () => void;
  readonly onSelectPanel: (panel: LeftPanel) => void;
  readonly onOpenSettings: () => void;
  /** Dismisses the drawer before a workspace-selector action runs. */
  readonly onWorkspaceAction: () => void;
  readonly currentWorkspacePath?: string;
}) {
  const panels = useLeftPanelContributions();

  return (
    <Drawer
      open={open}
      onDismiss={onDismiss}
      label="Navigation"
      side="right"
    >
      <h2 className="px-4 pt-3 pb-2 text-sm font-bold">Menu</h2>
      <WorkspaceSwitchingSelector variant="drawer" currentPath={currentWorkspacePath} onAction={onWorkspaceAction} />

      <div className="flex flex-1 flex-col gap-0.5 p-2">
        {panels.map((panel) => {
          const badge = badges[panel.id];
          return (
            <button
              key={panel.id}
              type="button"
              aria-label={`${panel.label}${badge !== undefined && badge > 0 ? `, ${badge} conflicts` : ""}`}
              aria-current={activePanel === panel.id ? "page" : undefined}
              className={row}
              onClick={() => onSelectPanel(panel.id)}
            >
              <PanelIcon name={panel.icon} />
              <span className="flex-1 truncate">{panel.label}</span>
              {badge !== undefined && badge > 0 && <CountBadge count={badge} />}
            </button>
          );
        })}
      </div>

      <div className="border-t border-border p-2">
        <button type="button" aria-label="Settings" className={row} onClick={onOpenSettings}>
          <PanelIcon name="settings" />
          <span className="flex-1 truncate">Settings</span>
        </button>
      </div>
    </Drawer>
  );
}
