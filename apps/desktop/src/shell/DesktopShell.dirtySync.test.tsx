// @vitest-environment happy-dom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Regression coverage for the settings-tab dirty-sync effect in
 * {@link DesktopShell}.
 *
 * The effect mirrors the settings store's `isDirty` flag into the tab reducer
 * so the settings tab shows the dirty dot and triggers DirtyCloseDialog. It
 * must dispatch only when `settingsIsDirty` or settings-tab presence changes —
 * not on every `tabState.tabs` array mutation (e.g. opening/closing unrelated
 * tabs produces a new array reference but should not re-trigger the sync).
 */

// Mock Tauri's isTauri so the shell's restore/persistence effects are no-ops
// under the test environment. This keeps the render focused on the dirty-sync
// effect without booting the native workspace-restore lifecycle.
vi.mock("@tauri-apps/api/core", () => ({
  isTauri: vi.fn(() => false)
}));

// Mock native commands so any transitive gateway call returns null instead of
// hitting Tauri IPC. Matches the pattern in SettingsTab.test.tsx.
vi.mock("../native/commands", () => ({
  invokeNativeCommand: vi.fn(() => Promise.resolve(null))
}));

// Mock the workspace adapter so the explorer's default `api` parameter doesn't
// reach for Tauri IPC. The explorer's mount effect is skipped when
// `initialWorkspacePath` is null, but mocking here is belt-and-suspenders.
vi.mock("../workspace/workspaceAdapter", () => ({
  workspaceDesktopApi: {
    pickWorkspaceDirectory: vi.fn(),
    openWorkspace: vi.fn(),
    listWorkspaceEntries: vi.fn(),
    openWorkspaceWindow: vi.fn(),
    windowWorkspaceRoot: vi.fn(() => Promise.resolve(null)),
    createWorkspaceFile: vi.fn(),
    createWorkspaceFolder: vi.fn(),
    renameWorkspaceEntry: vi.fn(),
    deleteWorkspaceEntry: vi.fn()
  }
}));

// Mock the workspace document adapter so saveDocument/loadDocumentIntoView
// don't touch native IPC.
vi.mock("../workspace/workspaceDocumentAdapter", () => ({
  workspaceDocumentApi: {
    readDocument: vi.fn(),
    writeDocument: vi.fn(),
    createDocument: vi.fn()
  }
}));

// Spy on the tab reducer to count setDirty dispatches WITHOUT altering reducer
// semantics. The spy delegates to the real implementation via importActual, so
// state transitions are identical to production — only the call log is
// observable.
vi.mock("../tabs/tabModel", async () => {
  const actual = await vi.importActual<typeof import("../tabs/tabModel")>("../tabs/tabModel");
  return {
    ...actual,
    desktopTabReducer: vi.fn(actual.desktopTabReducer)
  };
});

import { isTauri } from "@tauri-apps/api/core";
import { desktopTabReducer } from "../tabs/tabModel";
import { getWorkspaceBridge } from "../extensions/workspaceBridge";
import { useSettingsStore } from "../settings/settingsStore";
import { ThemeProvider } from "../settings/ThemeProvider";
import { DesktopShell } from "./DesktopShell";
import { useShellState } from "./useShellState";

let root: Root | null = null;
let container: HTMLDivElement | null = null;

beforeEach(() => {
  vi.mocked(isTauri).mockReturnValue(false);
  // Reset the singleton settings store to a clean, non-dirty state so tests
  // start from a known baseline (other describe blocks in the same file run
  // would otherwise leak isDirty/stagedChanges).
  useSettingsStore.setState({
    isDirty: false,
    stagedChanges: {},
    dirtyCount: 0
  });
});

afterEach(async () => {
  await act(async () => root?.unmount());
  container?.remove();
  root = null;
  container = null;
  vi.mocked(desktopTabReducer).mockClear();
  useSettingsStore.setState({
    isDirty: false,
    stagedChanges: {},
    dirtyCount: 0
  });
});

/**
 * Renders the shell into a fresh container and flushes effects.
 *
 * Wrapping in {@link ThemeProvider} is required because `DesktopShell` consumes
 * `useTheme()` — without the provider the hook throws outside its context.
 */
function Shell() {
  return <DesktopShell shell={useShellState()} />;
}

async function renderShell(): Promise<HTMLDivElement> {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => {
    root?.render(
      <ThemeProvider>
        <Shell />
      </ThemeProvider>
    );
  });
  return container;
}

/**
 * Counts `setDirty` actions dispatched for the settings tab so far.
 *
 * The reducer spy records every `(state, action)` pair; we filter for
 * `setDirty` actions whose `tabId` is `"settings"`.
 */
function settingsDirtyDispatchCount(): number {
  return vi.mocked(desktopTabReducer).mock.calls.filter(([, action]) => {
    const a = action as { type: string; tabId?: string };
    return a.type === "setDirty" && a.tabId === "settings";
  }).length;
}

/** Clicks an element and flushes React updates. */
async function click(element: Element): Promise<void> {
  await act(async () => {
    element.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
  });
}

describe("DesktopShell settings dirty-sync", () => {
  it("does not dispatch setDirty when no settings tab is open", async () => {
    await renderShell();
    expect(settingsDirtyDispatchCount()).toBe(0);

    // Flipping the settings dirty flag with no settings tab open must not
    // dispatch — the effect guards on settings-tab presence.
    await act(async () => {
      useSettingsStore.setState({ isDirty: true, stagedChanges: { "x": 1 }, dirtyCount: 1 });
    });
    expect(settingsDirtyDispatchCount()).toBe(0);
  });

  it("dispatches setDirty when the settings tab opens and when settingsIsDirty changes", async () => {
    await renderShell();
    const bridge = getWorkspaceBridge();
    expect(bridge).not.toBeNull();

    // Opening the settings tab flips hasSettingsTab false→true, so the effect
    // runs and syncs the current (false) dirty flag.
    await act(async () => bridge!.openTab("settings", "Settings"));
    expect(settingsDirtyDispatchCount()).toBe(1);

    // Marking settings dirty flips settingsIsDirty false→true → one dispatch.
    await act(async () => {
      useSettingsStore.setState({ isDirty: true, stagedChanges: { "x": 1 }, dirtyCount: 1 });
    });
    expect(settingsDirtyDispatchCount()).toBe(2);
    expect(container!.querySelector('[aria-label="Unsaved changes"]')).not.toBeNull();

    // Clearing settings dirty flips settingsIsDirty true→false → one dispatch.
    await act(async () => {
      useSettingsStore.setState({ isDirty: false, stagedChanges: {}, dirtyCount: 0 });
    });
    expect(settingsDirtyDispatchCount()).toBe(3);
    expect(container!.querySelector('[aria-label="Unsaved changes"]')).toBeNull();
  });

  it("does not dispatch a redundant setDirty when unrelated tabs open or close", async () => {
    await renderShell();
    const bridge = getWorkspaceBridge()!;

    // Open the settings tab — exactly one setDirty dispatch.
    await act(async () => bridge.openTab("settings", "Settings"));
    const baseline = settingsDirtyDispatchCount();
    expect(baseline).toBe(1);

    // Opening an unrelated tab produces a new tabState.tabs array reference
    // but does NOT change settingsIsDirty or hasSettingsTab. The effect must
    // not re-run, so no redundant setDirty dispatch.
    await act(async () => bridge.openTab("graph", "Graph"));
    expect(settingsDirtyDispatchCount()).toBe(baseline);

    // Opening another unrelated tab — same expectation.
    await act(async () => bridge.openTab("preview", "Preview"));
    expect(settingsDirtyDispatchCount()).toBe(baseline);

    // Closing an unrelated (non-dirty) tab also mutates the tabs array. The
    // settings dirty-sync effect must still not fire.
    const closePreview = container!.querySelector('[aria-label="Close Preview"]');
    expect(closePreview).not.toBeNull();
    await click(closePreview!);
    expect(settingsDirtyDispatchCount()).toBe(baseline);
  });

  it("stops dispatching setDirty once the settings tab is closed", async () => {
    await renderShell();
    const bridge = getWorkspaceBridge()!;

    await act(async () => bridge.openTab("settings", "Settings"));
    const baseline = settingsDirtyDispatchCount();
    expect(baseline).toBe(1);

    // Close the settings tab (not dirty → removed immediately, no dialog).
    const closeSettings = container!.querySelector('[aria-label="Close Settings"]');
    expect(closeSettings).not.toBeNull();
    await click(closeSettings!);

    // The effect re-runs (hasSettingsTab true→false) but returns early without
    // dispatching.
    expect(settingsDirtyDispatchCount()).toBe(baseline);

    // Now flip the dirty flag — no settings tab, so no dispatch.
    await act(async () => {
      useSettingsStore.setState({ isDirty: true, stagedChanges: { "x": 1 }, dirtyCount: 1 });
    });
    expect(settingsDirtyDispatchCount()).toBe(baseline);
  });

  it("opens the dirty-close dialog for a dirty settings tab and cancels", async () => {
    await renderShell();
    const bridge = getWorkspaceBridge()!;

    await act(async () => bridge.openTab("settings", "Settings"));
    await act(async () => {
      useSettingsStore.setState({ isDirty: true, stagedChanges: { "x": 1 }, dirtyCount: 1 });
    });
    await click(container!.querySelector('[aria-label="Close Settings"]')!);

    const dialog = container!.querySelector<HTMLElement>(
      '[role="dialog"][aria-label="Unsaved changes"]'
    );
    expect(dialog).not.toBeNull();
    expect(dialog?.textContent).toContain("Cancel");
    expect(dialog?.textContent).toContain("Discard");
    expect(dialog?.textContent).toContain("Save and close");

    await click(dialog!.querySelector('button[type="button"]')!);

    expect(container!.querySelector('[role="dialog"][aria-label="Unsaved changes"]')).toBeNull();
    expect(container!.querySelector('[aria-label="Close Settings"]')).not.toBeNull();
    expect(useSettingsStore.getState().isDirty).toBe(true);
  });

  it("discards dirty settings through resetStaged before closing", async () => {
    const resetStaged = vi.fn(() => {
      useSettingsStore.setState({ stagedChanges: {}, isDirty: false, dirtyCount: 0 });
    });
    useSettingsStore.setState({
      resetStaged,
      isDirty: true,
      stagedChanges: { "x": 1 },
      dirtyCount: 1
    });
    await renderShell();
    const bridge = getWorkspaceBridge()!;

    await act(async () => bridge.openTab("settings", "Settings"));
    await click(container!.querySelector('[aria-label="Close Settings"]')!);
    await click(container!.querySelector('[role="dialog"] button:nth-of-type(2)')!);

    expect(resetStaged).toHaveBeenCalledTimes(1);
    expect(container!.querySelector('[aria-label="Close Settings"]')).toBeNull();
    expect(container!.querySelector('[role="dialog"]')).toBeNull();
    expect(useSettingsStore.getState().isDirty).toBe(false);
  });

  it("saves dirty settings before closing when Save and close is chosen", async () => {
    const saveSettings = vi.fn(async () => ({ success: true as const, diagnostics: [] }));
    useSettingsStore.setState({
      saveSettings,
      isDirty: true,
      stagedChanges: { "x": 1 },
      dirtyCount: 1
    });
    await renderShell();
    const bridge = getWorkspaceBridge()!;

    await act(async () => bridge.openTab("settings", "Settings"));
    await click(container!.querySelector('[aria-label="Close Settings"]')!);
    await click(container!.querySelector('[role="dialog"] button:nth-of-type(3)')!);

    expect(saveSettings).toHaveBeenCalledTimes(1);
    expect(container!.querySelector('[aria-label="Close Settings"]')).toBeNull();
    expect(container!.querySelector('[role="dialog"]')).toBeNull();
  });
});
