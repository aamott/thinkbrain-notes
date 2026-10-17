/**
 * The window-level keyboard shortcuts.
 *
 * Split out of {@link useShellState} because it is one self-contained
 * behaviour with a long dependency list, and because keeping it inline made
 * the state hook read as a wall rather than as composition. It is behaviour,
 * not chrome, so it stays out of the shells: a shortcut works the same whether
 * the desktop rail or the phone bubbles are on screen.
 */

import { useEffect, type Dispatch } from "react";

import type { DesktopTab, DesktopTabAction, DesktopTabState } from "../tabs/tabModel";
import type { LeftPanel } from "./shellTypes";
import { commandSurfaceEffect } from "./useShellCommands";

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

/** Whether the event target is editable text — where navigation chords belong to the editor. */
function inEditableTarget(target: EventTarget | null): boolean {
  const element = target as HTMLElement | null;
  return (
    element !== null &&
    (element.isContentEditable ||
      element instanceof HTMLInputElement ||
      element instanceof HTMLTextAreaElement)
  );
}

/**
 * Binds the global shortcuts: command palette (Ctrl/Cmd+P), explorer
 * (Ctrl/Cmd+B), bottom dock (Ctrl/Cmd+J), save (Ctrl/Cmd+S), tab switching
 * (Ctrl+Tab / Ctrl+Shift+Tab), history Back/Forward (Alt+Left/Right, plus
 * Ctrl/Cmd+[ and Ctrl/Cmd+]), mouse thumb buttons, and Escape to dismiss
 * the palette.
 *
 * History chords: Alt+Left/Right is the browser and file-manager convention,
 * bound only as a bare chord — Shift+Alt arrows keep their selection meaning
 * everywhere, and Ctrl/Cmd+Alt arrows keep their word-jump meaning. Ctrl+[/]
 * is the indentation chord in the editor on every platform, so it navigates
 * only outside editable targets. Every history gesture runs the mounted
 * chrome's command-surface effect when one is registered — the phone's route
 * stack is its own history — and falls back to the desktop tab-history
 * dispatch, which no-ops when the cursor has nowhere to go.
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
    const navigateHistory = (direction: -1 | 1) => {
      const surface = commandSurfaceEffect(direction === -1 ? "goBack" : "goForward");
      if (surface) {
        surface();
        return;
      }
      dispatchTabs({ type: direction === -1 ? "goBack" : "goForward" });
    };
    const onKeyDown = (event: KeyboardEvent) => {
      const modifier = event.ctrlKey || event.metaKey;
      const isTab = event.key === "Tab";
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
      // History Back/Forward. Brackets stay bound wherever they cannot be
      // indentation: inside an editable they belong to the editor on every
      // platform, so the chord is left alone there rather than stolen.
      if ((event.key === "[" || event.key === "]") && modifier && !event.altKey && !event.shiftKey) {
        if (!inEditableTarget(event.target)) {
          event.preventDefault();
          navigateHistory(event.key === "[" ? -1 : 1);
        }
        return;
      }
      if (
        event.altKey &&
        !event.shiftKey &&
        !modifier &&
        (event.key === "ArrowLeft" || event.key === "ArrowRight")
      ) {
        if (!inEditableTarget(event.target)) {
          event.preventDefault();
          navigateHistory(event.key === "ArrowLeft" ? -1 : 1);
        }
        return;
      }
      if (event.key === "Escape") {
        if (!event.defaultPrevented && paletteOpen) closePalette();
      }
    };
    // Mouse thumb buttons (X1/X2) arrive as auxclick button 3/4 — the same
    // Back/Forward gesture browsers and file managers honour. `mouseup` is
    // used rather than `auxclick` for WebKitGTK coverage, where auxclick is
    // not reliably dispatched for the extra buttons.
    const onMouseUp = (event: MouseEvent) => {
      if (event.button !== 3 && event.button !== 4) return;
      event.preventDefault();
      navigateHistory(event.button === 3 ? -1 : 1);
    };
    window.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, [closePalette, openPalette, paletteOpen, selectLeftPanel, toggleBottomPanel, activeTab, saveDocument, dispatchTabs, tabState.tabs, tabState.activeTabId]);
}
