import { useEffect, useRef } from "react";

import { Drawer } from "@thinkbrain/ui";

import { useLeftPanelContributions } from "../../panels/panelRegistryModel";
import { PanelIcon } from "../panelIcons";
import type { LeftPanel } from "../shellTypes";

const LONG_PRESS_DELAY_MS = 500;

// 48px already clears the touch minimum, so no `pointer-coarse:` bump is
// needed — the same reasoning `BottomNav` records for its 56px slots.
const row =
  "flex min-h-12 w-full cursor-pointer items-center gap-3 rounded-small border-0 bg-transparent px-3 text-left text-sm text-sidebar-foreground hover:bg-accent tn-focus-ring";

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
  onLongPressPanel,
  hubPanelIds,
  hubFull = false
}: {
  readonly open: boolean;
  readonly activePanel: LeftPanel | null;
  readonly badges: Readonly<Record<string, number>>;
  readonly workspaceName: string | null;
  readonly onDismiss: () => void;
  readonly onSelectPanel: (panel: LeftPanel) => void;
  readonly onOpenSettings: () => void;
  readonly onLongPressPanel?: (panel: LeftPanel) => void;
  /** Panels that already hold a hub slot, so a row can say so before it is pressed. */
  readonly hubPanelIds?: readonly string[];
  /** Whether the hub is at `MAX_HUB_ITEMS`, which makes a pin a no-op. */
  readonly hubFull?: boolean;
}) {
  const panels = useLeftPanelContributions();
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressTriggeredRef = useRef(false);

  useEffect(
    () => () => {
      if (longPressTimerRef.current !== null) clearTimeout(longPressTimerRef.current);
    },
    []
  );

  return (
    <Drawer open={open} onDismiss={onDismiss} label="Navigation">
      <div className="border-b border-border px-4 py-3">
        <p className="truncate text-sm font-bold">{workspaceName ?? "No workspace open"}</p>
      </div>

      {/* A long press is invisible: nothing on a phone announces that pressing
          and holding does anything at all. This line is the only place the
          affordance is stated, and it also answers the two silent refusals —
          a full hub, and a row that is already pinned (marked below). */}
      {onLongPressPanel && (
        <p className="px-4 pt-3 text-xs leading-snug text-sidebar-foreground opacity-70">
          {hubFull
            ? "The bottom bar is full. Press and hold one of its shortcuts to remove it, then press and hold a section here to pin it."
            : "Press and hold a section to pin it to the bottom bar. Press and hold a bottom bar shortcut to remove it."}
        </p>
      )}

      <div className="flex flex-1 flex-col gap-0.5 p-2">
        {panels.map((panel) => {
          const badge = badges[panel.id];
          const pinned = hubPanelIds?.includes(panel.id) ?? false;
          return (
            <button
              key={panel.id}
              type="button"
              aria-label={`${panel.label}${badge !== undefined && badge > 0 ? `, ${badge} conflicts` : ""}`}
              aria-current={activePanel === panel.id ? "page" : undefined}
              className={row}
              onClick={() => onSelectPanel(panel.id)}
              onTouchStart={(event) => {
                if (!onLongPressPanel) return;
                if (longPressTimerRef.current !== null) clearTimeout(longPressTimerRef.current);
                longPressTriggeredRef.current = false;
                longPressTimerRef.current = setTimeout(() => {
                  longPressTimerRef.current = null;
                  longPressTriggeredRef.current = true;
                  event.preventDefault();
                  onLongPressPanel(panel.id);
                }, LONG_PRESS_DELAY_MS);
              }}
              onTouchEnd={(event) => {
                if (longPressTimerRef.current !== null) {
                  clearTimeout(longPressTimerRef.current);
                  longPressTimerRef.current = null;
                }
                if (longPressTriggeredRef.current) event.preventDefault();
              }}
              onTouchMove={() => {
                if (longPressTimerRef.current !== null) {
                  clearTimeout(longPressTimerRef.current);
                  longPressTimerRef.current = null;
                }
                longPressTriggeredRef.current = false;
              }}
              onTouchCancel={() => {
                if (longPressTimerRef.current !== null) {
                  clearTimeout(longPressTimerRef.current);
                  longPressTimerRef.current = null;
                }
                longPressTriggeredRef.current = false;
              }}
              onContextMenu={(event) => {
                if (!onLongPressPanel) return;
                event.preventDefault();
                if (longPressTriggeredRef.current) return;
                onLongPressPanel(panel.id);
              }}
            >
              <PanelIcon name={panel.icon} />
              <span className="flex-1 truncate">{panel.label}</span>
              {/* Visible, but deliberately not part of the accessible name:
                  announcing the pin state is a follow-up. */}
              {pinned && (
                <span className="shrink-0 text-[0.6rem] font-bold tracking-wide uppercase opacity-60">
                  Pinned
                </span>
              )}
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
