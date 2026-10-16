import { useMemo } from "react";

import type { DesktopCommandContext } from "../../commands/commandRegistry";
import { isSelectableLeftPanel, isSelectableRightPanel, type RightPanel } from "../shellTypes";
import { useCommandSurface } from "../useShellCommands";
import type { PhoneNavigation } from "./usePhoneNavigation";

/** Points shared command effects at the phone chrome's own surfaces. */
export function usePhoneCommandSurface(navigation: PhoneNavigation): void {
  // Command effects rerouted to this chrome's surfaces. The shared
  // `runCommand` would otherwise write dock state nothing here renders —
  // `shell.rightPanel` is desktop-only and `shell.leftPanel` is *derived
  // from* the route, never the reverse (plus a stray `explorerOpen` persist a
  // phone action had no business writing). Left reveals become panel routes —
  // explorer is the Files home, not a "panel" route — and right reveals open
  // the inspector, the same mapping the ⋮ menu and `showVersions` use.
  // Effects the phone already honours (theme, bottom sheet, new-note focus)
  // are not listed, so they keep the shared implementation.
  const commandSurface = useMemo<Partial<DesktopCommandContext>>(() => {
    const revealLeft = (panelId: string) => {
      if (!isSelectableLeftPanel(panelId)) return;
      navigation.push(panelId === "explorer" ? { kind: "files" } : { kind: "panel", panel: panelId });
    };
    const toggleInspector = (panel: RightPanel) => {
      const current = navigation.overlay;
      if (current?.kind === "inspector" && current.panel === panel) {
        navigation.dismissOverlay();
      } else {
        navigation.showOverlay({ kind: "inspector", panel, parent: "content" });
      }
    };
    return {
      showExplorer: () => navigation.push({ kind: "files" }),
      openSearch: () => navigation.push({ kind: "panel", panel: "search" }),
      // There is no collapsible left dock to toggle back to — Files is the
      // base route — so a toggle degrades to a reveal (a no-op on Files).
      toggleExplorer: () => navigation.push({ kind: "files" }),
      toggleOutline: () => toggleInspector("outline"),
      toggleAssistant: () => toggleInspector("assistant"),
      revealPanel: (panelId) => {
        if (isSelectableRightPanel(panelId)) {
          navigation.showOverlay({ kind: "inspector", panel: panelId, parent: "content" });
        } else {
          revealLeft(panelId);
        }
      },
      revealLeftPanel: revealLeft,
      // History walks this chrome's route stack, not desktop tab history —
      // `back`/`forward` already no-op when the browser-history depth says
      // there is nowhere to go.
      goBack: navigation.back,
      goForward: navigation.forward
    };
  }, [navigation]);
  useCommandSurface(commandSurface);
}
