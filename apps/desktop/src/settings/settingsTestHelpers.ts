import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { vi } from "vitest";

import { useSettingsStore, type SettingsStoreState } from "./settingsStore";

/**
 * Shared test helpers for settings component and logic tests.
 *
 * Extracts the `SEEDED_APP_VALUES` constant, store-seeding boilerplate, and the
 * `createRoot` + `act` render/click/unmount harness duplicated across 7+ test
 * files. Each file previously declared its own copy of these; the duplication
 * was flagged as a maintenance burden in the settings audit.
 */

/** Default app values seeded into the store for most settings tests. */
export const SEEDED_APP_VALUES: Record<string, unknown> = {
  "appearance.theme": "system",
  "appearance.themeFile": null,
  "editor.fontSize": 16,
  "editor.lineWrapping": true,
  "settings.autosave": false
};

/**
 * Snapshot of the store's real action implementations, captured once at module
 * load (before any test mutates the singleton). `seedSettingsStore` restores
 * these so callers that pass no action overrides get the real actions back
 * rather than a stale spy from a previous test.
 */
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
 * Resets the singleton settings store to a clean, loaded state.
 *
 * The 12 standard data fields are always set; `overrides` merges on top. If
 * `overrides.appValues` is provided it is merged with {@link SEEDED_APP_VALUES}
 * (extra keys added, existing keys replaced) rather than replacing the whole
 * map. Action functions are restored to their real implementations before
 * `overrides` are applied, so a bare `seedSettingsStore()` always clears any
 * action spy a prior test installed via `setState`. Pass action mocks (e.g.
 * `saveSettings: vi.fn(...)`) via `overrides` to spy on store actions.
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
 * Installs a `stageChange` spy on the singleton store.
 *
 * When `replicateStoreUpdates` is true the spy mirrors the real action by
 * updating `stagedChanges`/`isDirty`/`dirtyCount`, so tests that assert on the
 * resulting staged state see realistic values. When false the spy is a bare
 * no-op, suitable for tests that only assert whether `stageChange` was called
 * and with what arguments. Returns the spy so the caller can assert on it.
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

/**
 * Drains pending microtasks/macrotasks inside `act`.
 *
 * Replaces the fragile double-`Promise.resolve()` flush with a single
 * `setTimeout(0)` macrotask flush, which drains the microtask queue as well and
 * is robust to an implementation adding one more `await` to a handler.
 */
export async function flushPromises(): Promise<void> {
  await act(async () => {
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  });
}

/**
 * Encapsulates the `createRoot` + `act` render lifecycle used across settings
 * component tests. Each test file creates one harness instance and calls
 * `unmount()` in `afterEach`.
 */
export interface SettingsTestHarness {
  /** Renders a component into a fresh container and flushes initial effects. */
  render(component: React.ReactElement): Promise<HTMLDivElement>;
  /** Dispatches a click and flushes resulting React updates. */
  click(element: Element): Promise<void>;
  /** Dispatches an arbitrary event and flushes resulting React updates. */
  dispatch(element: Element, event: Event): Promise<void>;
  /** Unmounts the root and removes the container from the DOM. */
  unmount(): Promise<void>;
}

/**
 * Creates a render/click/unmount harness backed by `createRoot` + `act`.
 *
 * The project does not depend on `@testing-library/react`, so settings
 * component tests follow this convention instead. The harness owns the
 * `root` and `container` references internally; call `unmount()` in
 * `afterEach` to clean up.
 */
export function createSettingsTestHarness(): SettingsTestHarness {
  let root: Root | null = null;
  let container: HTMLDivElement | null = null;

  return {
    async render(component: React.ReactElement): Promise<HTMLDivElement> {
      container = document.createElement("div");
      document.body.append(container);
      root = createRoot(container);
      await act(async () => {
        root?.render(component);
      });
      return container;
    },

    async click(element: Element): Promise<void> {
      await act(async () => {
        element.dispatchEvent(
          new MouseEvent("click", { bubbles: true, cancelable: true })
        );
      });
    },

    async dispatch(element: Element, event: Event): Promise<void> {
      await act(async () => {
        element.dispatchEvent(event);
      });
    },

    async unmount(): Promise<void> {
      await act(async () => root?.unmount());
      container?.remove();
      root = null;
      container = null;
    }
  };
}
