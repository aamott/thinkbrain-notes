import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

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
 * Resets the singleton settings store to a clean, loaded state.
 *
 * The 12 standard fields are always set; `overrides` merges on top. If
 * `overrides.appValues` is provided it is merged with {@link SEEDED_APP_VALUES}
 * (extra keys added, existing keys replaced) rather than replacing the whole
 * map. Pass action mocks (e.g. `saveSettings: vi.fn(...)`) via `overrides` to
 * spy on store actions.
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
    ...rest
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

    async unmount(): Promise<void> {
      await act(async () => root?.unmount());
      container?.remove();
      root = null;
      container = null;
    }
  };
}
