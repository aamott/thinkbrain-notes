import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * settingHighlight bus robustness tests.
 *
 * Covers the maintenance story "Settings Highlight Bus Robustness":
 * - Immediate highlight + scheduled clear notifications
 * - Timer replacement when a new highlight overlaps a pending clear
 * - Unsubscribe idempotency
 * - A throwing subscriber is logged and skipped; siblings still receive both
 *   the highlight and the clear notification
 *
 * Each test re-imports the module fresh via `vi.resetModules()` so the
 * module-scoped state (current highlight, subscribers, pending timer) never
 * leaks across tests — mirroring the "no stale state across remounts" goal.
 *
 * HMR disposal is registered at module load (see settingHighlight.ts). The
 * Vitest environment does not expose `import.meta.hot`, so the dispose path is
 * not exercised here; it is verified manually via the dev-mode reload check.
 */
describe("settingHighlight bus", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.resetModules();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  /** Re-imports the module fresh so each test starts with empty state. */
  async function loadBus() {
    const mod = await import("./settingHighlight");
    return mod;
  }

  it("notifies subscribers immediately with the requested key", async () => {
    const { subscribeSettingHighlight, requestSettingHighlight } =
      await loadBus();
    const listener = vi.fn();
    subscribeSettingHighlight(listener);

    // Subscribing replays the current (null) state first.
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenLastCalledWith(null);

    requestSettingHighlight("editor.fontSize");
    expect(listener).toHaveBeenLastCalledWith("editor.fontSize");
  });

  it("notifies subscribers with null when the clear timer fires", async () => {
    const { subscribeSettingHighlight, requestSettingHighlight } =
      await loadBus();
    const listener = vi.fn();
    subscribeSettingHighlight(listener);
    listener.mockClear();

    requestSettingHighlight("editor.fontSize");
    expect(listener).toHaveBeenCalledWith("editor.fontSize");

    vi.advanceTimersByTime(1200);
    expect(listener).toHaveBeenLastCalledWith(null);
  });

  it("replaces the prior clear timer so only the latest highlight's clear fires", async () => {
    const { subscribeSettingHighlight, requestSettingHighlight } =
      await loadBus();
    const listener = vi.fn();
    subscribeSettingHighlight(listener);
    listener.mockClear();

    requestSettingHighlight("editor.fontSize");
    // Advance partway through the first duration, then request a new highlight.
    // The first clear timer must be cancelled so it doesn't fire prematurely.
    vi.advanceTimersByTime(600);
    requestSettingHighlight("editor.lineNumbers");
    listener.mockClear();

    // Reaching the original duration (1200ms from the first request) must NOT
    // clear, because the second request replaced the timer.
    vi.advanceTimersByTime(600);
    expect(listener).not.toHaveBeenCalled();

    // Only after the full second duration (1200ms from the second request)
    // does the clear fire exactly once.
    vi.advanceTimersByTime(600);
    const nullCalls = listener.mock.calls.filter((c) => c[0] === null);
    expect(nullCalls).toHaveLength(1);
    expect(listener).toHaveBeenLastCalledWith(null);
  });

  it("unsubscribes idempotently and stops receiving notifications", async () => {
    const { subscribeSettingHighlight, requestSettingHighlight } =
      await loadBus();
    const listener = vi.fn();
    const unsubscribe = subscribeSettingHighlight(listener);
    listener.mockClear();

    unsubscribe();
    // Calling again is a no-op (Set.delete returns false the second time).
    unsubscribe();

    requestSettingHighlight("editor.fontSize");
    vi.advanceTimersByTime(1200);

    expect(listener).not.toHaveBeenCalled();
  });

  it("isolates a throwing subscriber so siblings still receive highlight and clear", async () => {
    const { subscribeSettingHighlight, requestSettingHighlight } =
      await loadBus();
    const errorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    const throwing = vi.fn(() => {
      throw new Error("boom");
    });
    const healthy = vi.fn();

    subscribeSettingHighlight(throwing);
    subscribeSettingHighlight(healthy);
    // Clear the replayed current-state calls so we can assert on the request.
    throwing.mockClear();
    healthy.mockClear();

    requestSettingHighlight("editor.fontFamily");

    expect(throwing).toHaveBeenCalledWith("editor.fontFamily");
    expect(healthy).toHaveBeenCalledWith("editor.fontFamily");
    expect(errorSpy).toHaveBeenCalled();

    throwing.mockClear();
    healthy.mockClear();
    errorSpy.mockClear();

    vi.advanceTimersByTime(1200);

    // The throwing subscriber is still invoked (and still fails loudly), but
    // the healthy subscriber receives the clear notification regardless.
    expect(throwing).toHaveBeenCalledWith(null);
    expect(healthy).toHaveBeenLastCalledWith(null);
    expect(errorSpy).toHaveBeenCalled();
  });
});
