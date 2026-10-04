/**
 * The command palette and the dispatch behind it.
 *
 * Split out of {@link useShellState}: the palette's open state, its focus
 * restore, and `runCommand`'s command-context wiring are one concern — what
 * a command does — and the chromes only see the results.
 */

import { useCallback, useRef, useState, type Dispatch, type SetStateAction } from "react";

import {
  useDesktopCommands,
  type DesktopCommand,
  type DesktopCommandContext
} from "../commands/commandRegistry";
import { isBuiltInLeftPanel } from "../panels/panelRegistryModel";
import { persistDesktopState } from "../settings/desktopStatePersistence";
import { useSettingsStore } from "../settings/settingsStore";
import type { AppTheme } from "../settings/ThemeProvider";
import { createStaticTab, type DesktopTabAction } from "../tabs/tabModel";
import {
  isSelectableRightPanel,
  type BottomPanel,
  type LeftPanel,
  type RightPanel
} from "./shellTypes";

interface UseShellCommandsOptions {
  readonly dispatchTabs: Dispatch<DesktopTabAction>;
  readonly theme: AppTheme;
  readonly setTheme: (theme: AppTheme) => void;
  readonly showExplorer: () => void;
  readonly requestNewNoteFocus: () => void;
  readonly selectLeftPanel: (panel: LeftPanel) => void;
  readonly setLeftPanel: Dispatch<SetStateAction<LeftPanel | null>>;
  readonly setRightPanel: Dispatch<SetStateAction<RightPanel | null>>;
  readonly toggleRightPanel: (panel: RightPanel) => void;
  readonly updateBottomPanel: (panel: BottomPanel | null) => void;
  readonly toggleBottomPanel: () => void;
}

export function useShellCommands({
  dispatchTabs,
  theme,
  setTheme,
  showExplorer,
  requestNewNoteFocus,
  selectLeftPanel,
  setLeftPanel,
  setRightPanel,
  toggleRightPanel,
  updateBottomPanel,
  toggleBottomPanel
}: UseShellCommandsOptions) {
  const paletteCommands = useDesktopCommands();
  const paletteRestoreFocusRef = useRef<HTMLElement | null>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);

  const openPalette = useCallback(() => {
    paletteRestoreFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setPaletteOpen(true);
  }, []);

  const closePalette = useCallback((restoreFocus = true) => {
    setPaletteOpen(false);
    if (restoreFocus) queueMicrotask(() => paletteRestoreFocusRef.current?.focus());
  }, []);

  const openSettingsTab = useCallback(() => {
    dispatchTabs({ type: "open", tab: createStaticTab("settings", "Settings") });
  }, [dispatchTabs]);

  /**
   * Flips `editor.livePreview` and persists it straight away.
   *
   * Read through the store's one-shot getter rather than a subscription: the
   * shell only needs the value at the moment the command fires.
   */
  const toggleLivePreview = useCallback(() => {
    const store = useSettingsStore.getState();
    const current = store.getEffectiveValue("editor.livePreview") !== false;
    void store.setSettingImmediately("editor.livePreview", !current);
  }, []);

  /** Executes a registered command with shell effects, keeping the registry canonical. */
  const runCommand = useCallback((command: DesktopCommand) => {
    const context: DesktopCommandContext = {
      showExplorer,
      focusNewNote: requestNewNoteFocus,
      openSearch: () => {
        setLeftPanel("search");
        persistDesktopState({ explorerOpen: false });
      },
      toggleTheme: () => setTheme(theme === "dark" ? "light" : "dark"),
      toggleExplorer: () => selectLeftPanel("explorer"),
      toggleOutline: () => toggleRightPanel("outline"),
      toggleAssistant: () => toggleRightPanel("assistant"),
      toggleBottomPanel,
      toggleLivePreview,
      // `panelId` is an unconstrained string at this boundary (see
      // `DesktopCommandContext`) so any extension can reveal a panel it
      // registered; narrow it against the live registry before it reaches
      // `RightPanel` shell state, so a typo or a stale id from a deactivated
      // extension is dropped instead of persisting as an id nothing renders.
      revealPanel: (panelId: string) => {
        if (isSelectableRightPanel(panelId)) setRightPanel(panelId);
      },
      // Narrow the unconstrained string against the live left-panel registry
      // before it reaches shell state, mirroring `revealPanel`'s guard for the
      // right side. A typo or stale id from a deactivated extension is dropped
      // instead of persisting as an id nothing renders.
      revealLeftPanel: (panelId: string) => {
        if (isBuiltInLeftPanel(panelId)) selectLeftPanel(panelId);
      },
      openSettings: openSettingsTab,
      rebuildIndex: () => updateBottomPanel("terminal"),
      closePalette
    };
    void Promise.resolve()
      .then(() => command.handler(context))
      .catch((error: unknown) => {
        console.error(`[commandRegistry] Command "${command.id}" failed.`, error);
      });
  }, [closePalette, openSettingsTab, requestNewNoteFocus, selectLeftPanel, setLeftPanel, setRightPanel, setTheme, showExplorer, theme, toggleBottomPanel, toggleLivePreview, toggleRightPanel, updateBottomPanel]);

  return {
    closePalette,
    openPalette,
    openSettingsTab,
    paletteCommands,
    paletteOpen,
    runCommand
  };
}
