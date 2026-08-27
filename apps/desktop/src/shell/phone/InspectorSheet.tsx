import { useId, useRef, type KeyboardEvent } from "react";
import { BottomSheet } from "@thinkbrain/ui";

import { cn } from "../../lib/utils";
import { RightPopout } from "../../panels/RightPopout";
import { useRightPanelContributions } from "../../panels/panelRegistryModel";
import type { RightPanel } from "../shellTypes";

/**
 * Inside the sheet the popout is a flow child, not a dock overlay.
 *
 * `Popout` positions itself `absolute` below 760px so the desktop's side docks
 * slide over the editor at narrow widths, insetting from both edges so the box
 * has a width at all. Every phone is below that breakpoint, so without this the
 * popout would fill the sheet corner to corner and cover the segmented control
 * that chose it. `static` is what makes those insets inert; `flex-1` also
 * overrides the dock's `flex-basis`, which resolves to nothing here — only
 * `DesktopShell` publishes `--tn-shell-right-width`.
 */
const AS_FLOW_CHILD =
  "[&>aside]:static [&>aside]:min-h-0 [&>aside]:flex-1 [&>aside]:border-l-0 [&>aside]:shadow-none";

/**
 * Document inspectors, reached from the header's `⋯`.
 *
 * Driven by `useRightPanelContributions()` — the same source the desktop
 * title-bar buttons read — so an extension that registers a right panel appears
 * here with no mobile-specific work.
 *
 * Nothing about the document is copied into this component: `documentContents`
 * is threaded straight from live shell state, so switching tabs underneath an
 * open sheet re-renders the inspector rather than stranding it on the old note.
 * A document that is not ready arrives as `null`, which each panel already
 * answers with its own placard — deliberately in preference to a sheet-level
 * "loading" state, which would unmount the `keepMounted` panels and take the
 * assistant's session with it.
 */
export function InspectorSheet({
  open,
  panel,
  rootPath,
  documentContents,
  onDismiss,
  onSelectPanel
}: {
  readonly open: boolean;
  readonly panel: RightPanel;
  readonly rootPath: string | null;
  readonly documentContents: string | null;
  readonly onDismiss: () => void;
  readonly onSelectPanel: (panel: RightPanel) => void;
}) {
  const panels = useRightPanelContributions();
  const idPrefix = useId();
  const panelId = `${idPrefix}-panel`;
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const handleTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (panels.length === 0) return;

    let nextIndex: number;
    switch (event.key) {
      case "ArrowLeft":
        nextIndex = (index - 1 + panels.length) % panels.length;
        break;
      case "ArrowRight":
        nextIndex = (index + 1) % panels.length;
        break;
      case "Home":
        nextIndex = 0;
        break;
      case "End":
        nextIndex = panels.length - 1;
        break;
      default:
        return;
    }

    event.preventDefault();
    const nextPanel = panels[nextIndex];
    if (!nextPanel) return;

    onSelectPanel(nextPanel.id);
    tabRefs.current[nextIndex]?.focus();
  };

  return (
    <BottomSheet open={open} onDismiss={onDismiss} label="Document tools" className="h-[80%]">
      <div
        role="tablist"
        aria-label="Inspectors"
        className="flex shrink-0 gap-1 overflow-x-auto border-b border-border p-2"
      >
        {panels.map((entry, index) => {
          const tabId = `${idPrefix}-tab-${entry.id}`;
          const isSelected = entry.id === panel;

          return (
            <button
              key={entry.id}
              ref={(element) => {
                tabRefs.current[index] = element;
              }}
              type="button"
              role="tab"
              id={tabId}
              aria-label={entry.label}
              aria-controls={panelId}
              aria-selected={isSelected}
              tabIndex={isSelected ? 0 : -1}
              // 44px already clears the touch minimum, so no `pointer-coarse:`
              // bump — the same reasoning `PhoneDrawer` records for its rows.
              className={cn(
                "min-h-11 shrink-0 cursor-pointer rounded-small border border-border bg-surface px-3 text-xs text-muted-foreground tn-focus-ring",
                isSelected && "bg-primary text-primary-foreground"
              )}
              onClick={() => onSelectPanel(entry.id)}
              onKeyDown={(event) => handleTabKeyDown(event, index)}
            >
              {entry.label}
            </button>
          );
        })}
      </div>
      <div
        id={panelId}
        role="tabpanel"
        aria-labelledby={`${idPrefix}-tab-${panel}`}
        className={cn("flex min-h-0 flex-1 flex-col", AS_FLOW_CHILD)}
      >
        <RightPopout panel={panel} rootPath={rootPath} documentContents={documentContents} />
      </div>
    </BottomSheet>
  );
}
