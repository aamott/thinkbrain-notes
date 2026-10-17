/**
 * The command palette and the dispatch behind it.
 *
 * Split out of {@link useShellState}: the palette's open state, its focus
 * restore, and `runCommand`'s command-context wiring are one concern — what
 * a command does — and the chromes only see the results.
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type Dispatch,
  type SetStateAction
} from "react";

import {
  useDesktopCommands,
  type DesktopCommand,
  type DesktopCommandContext
} from "../commands/commandRegistry";
import { persistDesktopState } from "../settings/desktopStatePersistence";
import { useSettingsStore } from "../settings/settingsStore";
import type { AppTheme } from "../settings/ThemeProvider";
import {
  canGoBackInTabs,
  canGoForwardInTabs,
  createStaticTab,
  type DesktopTabAction,
  type DesktopTabState
} from "../tabs/tabModel";
import {
  isSelectableLeftPanel,
  isSelectableRightPanel,
  type LeftPanel,
  type RightPanel
} from "./shellTypes";

/**
 * Context-effect overrides published by the chrome that is mounted.
 *
 * `runCommand` is built once in `useShellState` — before a chrome is chosen —
 * yet several `DesktopCommandContext` effects write desktop dock state the
 * phone chrome never reads: PhoneShell's left "dock" is a history route and
 * its right dock an inspector overlay, so `setLeftPanel`/`setRightPanel`
 * writes (and the `explorerOpen` persistence riding along) would land on
 * state nothing renders. The mounted chrome registers its own equivalents
 * through {@link useCommandSurface}; `null` means the desktop wiring built in
 * `runCommand` below is in effect. Any field is overridable, so a chrome can
 * substitute an explicit logged no-op for an effect it cannot express.
 */
let commandSurface: Partial<DesktopCommandContext> | null = null;

/**
 * Live availability the mounted chrome reports for the history commands it
 * owns. The phone's route stack is its own history, so a Home→note walk can
 * Back — and an open inspector can be dismissed — even while the tab history
 * has nowhere to go. A field left `undefined` falls back to the desktop
 * tab-history derivation.
 */
export interface CommandSurfaceAvailability {
  readonly canGoBack?: boolean;
  readonly canGoForward?: boolean;
}

let surfaceAvailability: CommandSurfaceAvailability | null = null;

// The palette's availability derivation lives in `useShellCommands`, a level
// above the chrome that registers the surface — a listener set re-reads the
// snapshot so Home→note Back flips to enabled the moment the phone's depth
// changes. `surfaceAvailability` only changes inside the registration
// effect, which also notifies, so it is a valid external-store snapshot.
const surfaceListeners = new Set<() => void>();
const bumpSurface = (): void => {
  surfaceListeners.forEach((listener) => listener());
};
const subscribeSurface = (listener: () => void): (() => void) => {
  surfaceListeners.add(listener);
  return () => {
    surfaceListeners.delete(listener);
  };
};

/**
 * The mounted chrome's rerouted effect for `key`, or `undefined` for the
 * desktop wiring — for callers outside the command path (window shortcuts,
 * mouse thumb buttons) that must honour the same mounted surface.
 */
export function commandSurfaceEffect<K extends keyof DesktopCommandContext>(
  key: K
): DesktopCommandContext[K] | undefined {
  return commandSurface?.[key];
}

/**
 * Registers `overrides` as the live command surface for as long as the calling
 * chrome is mounted, restoring the previous surface on unmount. ShellRoot
 * renders exactly one chrome at a time, so a single slot suffices.
 * `availability` reports the chrome's own Back/Forward state for the palette.
 */
export function useCommandSurface(
  overrides: Partial<DesktopCommandContext>,
  availability?: CommandSurfaceAvailability
): void {
  useEffect(() => {
    const previousSurface = commandSurface;
    const previousAvailability = surfaceAvailability;
    commandSurface = overrides;
    surfaceAvailability = availability ?? null;
    bumpSurface();
    return () => {
      commandSurface = previousSurface;
      surfaceAvailability = previousAvailability;
      bumpSurface();
    };
  }, [overrides, availability]);
}

interface UseShellCommandsOptions {
  readonly tabState: DesktopTabState;
  readonly dispatchTabs: Dispatch<DesktopTabAction>;
  readonly theme: AppTheme;
  readonly setTheme: (theme: AppTheme) => void;
  readonly showExplorer: () => void;
  readonly requestNewNoteFocus: () => void;
  readonly selectLeftPanel: (panel: LeftPanel) => void;
  readonly setLeftPanel: Dispatch<SetStateAction<LeftPanel | null>>;
  readonly setRightPanel: Dispatch<SetStateAction<RightPanel | null>>;
  readonly toggleRightPanel: (panel: RightPanel) => void;
  readonly toggleBottomPanel: () => void;
}

export function useShellCommands({
  tabState,
  dispatchTabs,
  theme,
  setTheme,
  showExplorer,
  requestNewNoteFocus,
  selectLeftPanel,
  setLeftPanel,
  setRightPanel,
  toggleRightPanel,
  toggleBottomPanel
}: UseShellCommandsOptions) {
  const registeredCommands = useDesktopCommands();
  // Re-read the mounted chrome's surface availability when it re-registers —
  // the chrome's own re-render does not reach this hook, so the snapshot is
  // how the palette learns the phone's Back depth changed.
  const surfaceAvail = useSyncExternalStore(
    subscribeSurface,
    () => surfaceAvailability,
    () => surfaceAvailability
  );
  // Back/Forward are state-dependent like the title-bar buttons: when the
  // history has nowhere to go the palette greys the command out with a reason
  // rather than running a no-op. The mounted chrome's availability wins when
  // it reports one — the phone's route stack can step back to Files or
  // dismiss an inspector while the tab history itself has nowhere to go.
  // (The desktop `requires` downgrade in `useDesktopCommands` is the same
  // pattern, driven by platform capabilities; this one is live history.)
  const paletteCommands = useMemo(
    () =>
      registeredCommands.map((command) => {
        const canBack = surfaceAvail?.canGoBack ?? canGoBackInTabs(tabState);
        const canForward = surfaceAvail?.canGoForward ?? canGoForwardInTabs(tabState);
        if (command.id === "go-back" && !canBack) {
          return {
            ...command,
            availability: "unavailable" as const,
            unavailableMessage: "No earlier visit in this workspace's history."
          };
        }
        if (command.id === "go-forward" && !canForward) {
          return {
            ...command,
            availability: "unavailable" as const,
            unavailableMessage: "No forward visit — it is cleared whenever a new tab is activated."
          };
        }
        return command;
      }),
    [registeredCommands, tabState, surfaceAvail]
  );
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
    // Reveal means select, not toggle: `selectLeftPanel` flips an already-open
    // panel shut, while a command saying "reveal" must leave the panel open no
    // matter how often it runs. The `explorerOpen` persistence mirrors
    // `selectLeftPanel`'s, minus the toggle.
    const revealLeft = (panelId: LeftPanel) => {
      setLeftPanel(panelId);
      persistDesktopState({ explorerOpen: panelId === "explorer" });
    };
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
      // shell state, so a typo or a stale id from a deactivated extension is
      // dropped instead of persisting as an id nothing renders. The registry
      // answers which dock the panel lives on, so one call serves both sides —
      // an extension's left panel (e.g. `journal-calendar.journal`) is revealed
      // by the same `revealPanel` a right panel is.
      revealPanel: (panelId: string) => {
        if (isSelectableLeftPanel(panelId)) revealLeft(panelId);
        else if (isSelectableRightPanel(panelId)) setRightPanel(panelId);
      },
      // Same live-registry guard, left dock only — the check admits registered
      // extension panels, not just the first-party ids.
      revealLeftPanel: (panelId: string) => {
        if (isSelectableLeftPanel(panelId)) revealLeft(panelId);
      },
      openSettings: openSettingsTab,
      // Same actions the title-bar buttons dispatch; the reducer no-ops when
      // the cursor has nowhere to go.
      goBack: () => dispatchTabs({ type: "goBack" }),
      goForward: () => dispatchTabs({ type: "goForward" }),
      closePalette,
      // Spread last: the mounted chrome's rerouted effects (see
      // `useCommandSurface`) replace the desktop dock wiring above. The
      // desktop chrome registers nothing, so this is a no-op there.
      ...commandSurface
    };
    void Promise.resolve()
      .then(() => command.handler(context))
      .catch((error: unknown) => {
        console.error(`[commandRegistry] Command "${command.id}" failed.`, error);
      });
  }, [closePalette, dispatchTabs, openSettingsTab, requestNewNoteFocus, selectLeftPanel, setLeftPanel, setRightPanel, setTheme, showExplorer, theme, toggleBottomPanel, toggleLivePreview, toggleRightPanel]);

  return {
    closePalette,
    openPalette,
    openSettingsTab,
    paletteCommands,
    paletteOpen,
    runCommand
  };
}
