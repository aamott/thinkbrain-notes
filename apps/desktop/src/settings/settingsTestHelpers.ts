import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { vi } from "vitest";

import { useSettingsStore, type SettingsStoreState } from "./settingsStore";

/**
 * Shared test helpers for settings component and logic tests — extracted from
 * duplicated boilerplate across 13+ test files (settings audit finding).
 */

/** Default app values seeded into the store for most settings tests. */
export const SEEDED_APP_VALUES: Record<string, unknown> = {
  "appearance.theme": "system",
  "appearance.themeFile": null,
  "editor.fontSize": 16,
  "editor.lineWrapping": true,
  "settings.autosave": false
};

/** Real action implementations captured at module load, before any test
 *  mutates the singleton. Restored by `seedSettingsStore` to clear spies. */
const INITIAL_ACTIONS: Partial<SettingsStoreState> = (() => {
  const s = useSettingsStore.getState();
  return {
    loadSettings: s.loadSettings,
    stageChange: s.stageChange,
    saveSettings: s.saveSettings,
    resetStaged: s.resetStaged,
    resetSection: s.resetSection,
    setActiveSection: s.setActiveSection,
    setSearchQuery: s.setSearchQuery,
    getEffectiveValue: s.getEffectiveValue,
    setSettingImmediately: s.setSettingImmediately
  };
})();

/**
 * Resets the store to a clean, loaded state. `overrides.appValues` merges with
 * {@link SEEDED_APP_VALUES}; other overrides apply on top. Actions are restored
 * to real implementations before overrides, so a bare call clears any spy from
 * a prior test. Pass action mocks via `overrides` to spy on store actions.
 */
export function seedSettingsStore(
  overrides: Partial<SettingsStoreState> = {}
): void {
  const { appValues: appValueOverrides, ...rest } = overrides;
  useSettingsStore.setState({
    appValues: { ...SEEDED_APP_VALUES, ...appValueOverrides },
    workspaceValues: null,
    workspaceRootPath: null,
    stagedChanges: {},
    isDirty: false,
    dirtyCount: 0,
    activeSection: null,
    searchQuery: "",
    loadError: null,
    saveError: null,
    validationDiagnostics: [],
    loaded: true,
    ...INITIAL_ACTIONS,
    ...rest
  });
}

/**
 * Installs a `stageChange` spy. When `replicateStoreUpdates` is true, the spy
 * mirrors the real action (updates `stagedChanges`/`isDirty`/`dirtyCount`).
 * When false, it's a no-op spy for call-assertion-only tests.
 */
export function installStageChangeSpy(
  replicateStoreUpdates = false
): ReturnType<typeof vi.fn> {
  const spy = vi.fn();
  if (replicateStoreUpdates) {
    spy.mockImplementation((key: string, value: unknown) => {
      useSettingsStore.setState((s) => {
        const staged = { ...s.stagedChanges, [key]: value };
        return {
          stagedChanges: staged,
          isDirty: true,
          dirtyCount: Object.keys(staged).length
        };
      });
    });
  }
  useSettingsStore.setState({ stageChange: spy });
  return spy;
}

/** Drains microtasks/macrotasks via `setTimeout(0)` inside `act`. Replaces
 *  the fragile double-`Promise.resolve()` flush. */
export async function flushPromises(): Promise<void> {
  await act(async () => {
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  });
}

/** `createRoot` + `act` render/click/dispatch/unmount harness. No
 *  `@testing-library/react` dependency; call `unmount()` in `afterEach`. */
export interface SettingsTestHarness {
  render(component: React.ReactElement): Promise<HTMLDivElement>;
  click(element: Element): Promise<void>;
  dispatch(element: Element, event: Event): Promise<void>;
  unmount(): Promise<void>;
}

export function createSettingsTestHarness(): SettingsTestHarness {
  let root: Root | null = null;
  let container: HTMLDivElement | null = null;

  return {
    async render(component: React.ReactElement): Promise<HTMLDivElement> {
      container = document.createElement("div");
      document.body.append(container);
      root = createRoot(container);
      await act(async () => { root?.render(component); });
      return container;
    },

    async click(element: Element): Promise<void> {
      await act(async () => {
        element.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
      });
    },

    async dispatch(element: Element, event: Event): Promise<void> {
      await act(async () => { element.dispatchEvent(event); });
    },

    async unmount(): Promise<void> {
      await act(async () => root?.unmount());
      container?.remove();
      root = null;
      container = null;
    }
  };
}
