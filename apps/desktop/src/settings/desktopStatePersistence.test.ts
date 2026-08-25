import { beforeEach, describe, expect, it, vi } from "vitest";

import { resetNotificationStore, useNotificationStore } from "../notifications/notificationStore";
import { DEFAULT_DESKTOP_STATE, type DesktopStateGateway } from "./desktopState";

/**
 * `desktopStatePersistence` wraps `saveDesktopState` / `loadDesktopState` with
 * fire-and-forget error reporting. These tests verify the reporting contract —
 * diagnostics are logged, notifications are deduplicated, and the call site's
 * shape (void for save, Promise for read) is preserved — without re-testing the
 * underlying gateway logic `desktopState.test.ts` already covers.
 */

// `isTauri` is mocked to true so the abstraction exercises its IPC path.
vi.mock("@tauri-apps/api/core", () => ({
  isTauri: () => true,
  invoke: () => Promise.resolve(null),
  convertFileSrc: (path: string) => path
}));

let saveShouldFail = false;
let loadShouldFail = false;
const saveSpy = vi.fn();
const loadSpy = vi.fn();

vi.mock("./desktopState", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./desktopState")>();
  return {
    ...actual,
    saveDesktopState: vi.fn(async (update: unknown, gateway?: DesktopStateGateway) => {
      saveSpy(update, gateway);
      if (saveShouldFail) throw new Error("disk full");
      return DEFAULT_DESKTOP_STATE;
    }),
    loadDesktopState: vi.fn(async (gateway?: DesktopStateGateway) => {
      loadSpy(gateway);
      if (loadShouldFail) throw new Error("permission denied");
      return DEFAULT_DESKTOP_STATE;
    })
  };
});

const {
  persistDesktopState,
  readDesktopState,
  reportDesktopStateReadFailure,
  DESKTOP_STATE_SOURCE
} = await import("./desktopStatePersistence");

beforeEach(() => {
  resetNotificationStore();
  saveSpy.mockClear();
  loadSpy.mockClear();
  saveShouldFail = false;
  loadShouldFail = false;
});

describe("persistDesktopState", () => {
  it("delegates to saveDesktopState and returns void (fire-and-forget)", () => {
    const result = persistDesktopState({ explorerOpen: false });
    expect(result).toBeUndefined();
    expect(saveSpy).toHaveBeenCalledTimes(1);
    expect(saveSpy).toHaveBeenCalledWith({ explorerOpen: false }, undefined);
  });

  it("reports a sticky error notification on save failure without throwing", async () => {
    saveShouldFail = true;
    persistDesktopState({ explorerOpen: true });
    // The catch is async — let the microtask flush.
    await Promise.resolve();

    const state = useNotificationStore.getState();
    expect(state.notifications).toHaveLength(1);
    const entry = state.notifications[0]!;
    expect(entry.source).toBe(DESKTOP_STATE_SOURCE);
    expect(entry.severity).toBe("sticky");
    expect(entry.variant).toBe("error");
    expect(entry.title).toContain("save");
    expect(entry.details).toBe("disk full");
    expect(state.activeToast?.id).toBe(entry.id);
  });

  it("logs the save failure to the console", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    saveShouldFail = true;
    persistDesktopState({ explorerOpen: true });
    await Promise.resolve();

    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining("[desktop-state] save failed"),
      expect.any(Error)
    );
    errorSpy.mockRestore();
  });

  it("deduplicates repeated save failures into one notification entry", async () => {
    saveShouldFail = true;
    persistDesktopState({ explorerOpen: true });
    await Promise.resolve();
    persistDesktopState({ explorerOpen: false });
    await Promise.resolve();
    persistDesktopState({ bottomPanelOpen: true });
    await Promise.resolve();

    const state = useNotificationStore.getState();
    expect(state.notifications).toHaveLength(1);
  });
});

describe("readDesktopState", () => {
  it("returns the loaded state on success without notifying", async () => {
    const state = await readDesktopState();
    expect(state).toEqual(DEFAULT_DESKTOP_STATE);
    expect(loadSpy).toHaveBeenCalledTimes(1);
    expect(useNotificationStore.getState().notifications).toHaveLength(0);
  });

  it("returns defaults and reports a transient warning on failure", async () => {
    loadShouldFail = true;
    const state = await readDesktopState();
    expect(state).toEqual(DEFAULT_DESKTOP_STATE);

    const notifications = useNotificationStore.getState().notifications;
    expect(notifications).toHaveLength(1);
    const entry = notifications[0]!;
    expect(entry.severity).toBe("transient");
    expect(entry.variant).toBe("warning");
    expect(entry.title).toContain("read");
    expect(entry.details).toBe("permission denied");
  });

  it("logs the read failure to the console", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    loadShouldFail = true;
    await readDesktopState();
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("[desktop-state] load failed"),
      expect.any(Error)
    );
    warnSpy.mockRestore();
  });
});

describe("reportDesktopStateReadFailure", () => {
  it("notifies a transient warning with the load dedup key", () => {
    reportDesktopStateReadFailure(new Error("gone"));

    const state = useNotificationStore.getState();
    expect(state.notifications).toHaveLength(1);
    expect(state.notifications[0]!.severity).toBe("transient");
    expect(state.notifications[0]!.variant).toBe("warning");
  });

  it("deduplicates with readDesktopState failures (same dedup key)", async () => {
    reportDesktopStateReadFailure(new Error("first"));
    loadShouldFail = true;
    await readDesktopState();

    expect(useNotificationStore.getState().notifications).toHaveLength(1);
  });
});

describe("save vs load dedup isolation", () => {
  it("keeps save and load failures as separate entries", async () => {
    saveShouldFail = true;
    loadShouldFail = true;
    persistDesktopState({ explorerOpen: true });
    await Promise.resolve();
    await readDesktopState();

    const notifications = useNotificationStore.getState().notifications;
    expect(notifications).toHaveLength(2);
    const sources = notifications.map((n) => n.severity).sort();
    expect(sources).toEqual(["sticky", "transient"]);
  });
});
