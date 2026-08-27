/**
 * The window-level keyboard shortcuts.
 *
 * Split out of {@link useShellState} because it is one self-contained
 * behaviour with a long dependency list, and because keeping it inline made
 * the state hook read as a wall rather than as composition. It is behaviour,
 * not chrome, so it stays out of the shells: a shortcut works the same whether
 * the desktop rail or the phone hub is on screen.
 */

import { useEffect, type Dispatch } from "react";

import type { DesktopTab, DesktopTabAction, DesktopTabState } from "../tabs/tabModel";
import type { LeftPanel } from "./shellTypes";

/** What the shortcuts need in order to act. */
export interface ShellShortcutsProps {
  readonly tabState: DesktopTabState;
  readonly dispatchTabs: Dispatch<DesktopTabAction>;
  readonly activeTab: DesktopTab | null;
  readonly paletteOpen: boolean;
  readonly openPalette: () => void;
  readonly closePalette: (restoreFocus?: boolean) => void;
  readonly selectLeftPanel: (panel: LeftPanel) => void;
  readonly toggleBottomPanel: () => void;
  readonly saveDocument: (tab: DesktopTab) => Promise<boolean>;
}

/**
 * Binds the global shortcuts: command palette (Ctrl/Cmd+P), explorer
 * (Ctrl/Cmd+B), bottom dock (Ctrl/Cmd+J), save (Ctrl/Cmd+S), tab switching
 * (Ctrl+Tab / Ctrl+Shift+Tab), and Escape to dismiss the palette.
 */
export function useShellShortcuts({
  tabState,
  dispatchTabs,
  activeTab,
  paletteOpen,
  openPalette,
  closePalette,
  selectLeftPanel,
  toggleBottomPanel,
  saveDocument
}: ShellShortcutsProps): void {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const modifier = event.ctrlKey || event.metaKey;
      const isTab = event.key === "Tab" || event.key === "Backtab" || event.code === "Tab";
      if (modifier && isTab) {
        event.preventDefault();
        event.stopPropagation();
        if (tabState.tabs.length > 1) {
          const currentIndex = tabState.tabs.findIndex((t) => t.id === tabState.activeTabId);
          const delta = event.shiftKey ? -1 : 1;
          const nextIndex = (currentIndex + delta + tabState.tabs.length) % tabState.tabs.length;
          const nextTab = tabState.tabs[nextIndex];
          if (nextTab) dispatchTabs({ type: "activate", tabId: nextTab.id });
        }
        return;
      }
      if (modifier && event.key.toLowerCase() === "p") {
        event.preventDefault();
        if (paletteOpen) closePalette();
        else openPalette();
      }
      if (modifier && event.key.toLowerCase() === "b") {
        event.preventDefault();
        selectLeftPanel("explorer");
      }
      if (modifier && event.key.toLowerCase() === "j") {
        event.preventDefault();
        toggleBottomPanel();
      }
      if (modifier && event.key.toLowerCase() === "s") {
        if (activeTab?.kind === "editor" && activeTab.isDirty) {
          event.preventDefault();
          void saveDocument(activeTab);
        }
      }
      if (event.key === "Escape") {
        if (!event.defaultPrevented && paletteOpen) closePalette();
      }
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [closePalette, openPalette, paletteOpen, selectLeftPanel, toggleBottomPanel, activeTab, saveDocument, dispatchTabs, tabState.tabs, tabState.activeTabId]);
}
