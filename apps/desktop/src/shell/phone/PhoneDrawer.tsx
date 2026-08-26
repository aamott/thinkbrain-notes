import { Drawer } from "@thinkbrain/ui";

import { useLeftPanelContributions } from "../../panels/panelRegistryModel";
import { PanelIcon } from "../panelIcons";
import type { LeftPanel } from "../shellTypes";

/**
 * The phone's navigation drawer.
 *
 * Renders `useLeftPanelContributions()` — the same source the desktop rail reads
 * — so entries, active state and badges have one definition, not two. The labels
 * the rail keeps in `aria-label` become visible text here, because a phone has
 * no hover to teach an unlabelled glyph.
 */
export function PhoneDrawer({
  open,
  activePanel,
  badges,
  workspaceName,
  onDismiss,
  onSelectPanel,
  onOpenSettings,
  onLongPressPanel
}: {
  readonly open: boolean;
  readonly activePanel: LeftPanel | null;
  readonly badges: Readonly<Record<string, number>>;
  readonly workspaceName: string | null;
  readonly onDismiss: () => void;
  readonly onSelectPanel: (panel: LeftPanel) => void;
  readonly onOpenSettings: () => void;
  readonly onLongPressPanel?: (panel: LeftPanel) => void;
}) {
  const panels = useLeftPanelContributions();
  // 48px already clears the touch minimum, so no `pointer-coarse:` bump is
  // needed — the same reasoning `BottomNav` records for its 56px slots.
  const row =
    "flex min-h-12 w-full cursor-pointer items-center gap-3 rounded-small border-0 bg-transparent px-3 text-left text-sm text-sidebar-foreground hover:bg-accent focus-visible:-outline-offset-2 focus-visible:outline-2 focus-visible:outline-ring";

  return (
    <Drawer open={open} onDismiss={onDismiss} label="Navigation">
      <div className="border-b border-border px-4 py-3">
        <p className="truncate text-sm font-bold">{workspaceName ?? "No workspace open"}</p>
      </div>

      <div className="flex flex-1 flex-col gap-0.5 p-2">
        {panels.map((panel) => {
          const badge = badges[panel.id];
          return (
            <button
              key={panel.id}
              type="button"
              aria-label={panel.label}
              aria-current={activePanel === panel.id ? "page" : undefined}
              className={row}
              onClick={() => onSelectPanel(panel.id)}
              onContextMenu={(event) => {
                if (!onLongPressPanel) return;
                event.preventDefault();
                onLongPressPanel(panel.id);
              }}
            >
              <PanelIcon name={panel.icon} />
              <span className="flex-1 truncate">{panel.label}</span>
              {badge !== undefined && badge > 0 && (
                <span className="rounded-full bg-danger px-1.5 text-[0.65rem] font-bold text-danger-foreground">
                  {badge}
                </span>
              )}
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
