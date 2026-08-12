import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createDebounced } from "./debounce";

describe("a debounced call", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("waits for the delay before running", () => {
    const run = vi.fn();
    const schedule = createDebounced(run, 100);

    schedule();
    vi.advanceTimersByTime(99);

    expect(run).not.toHaveBeenCalled();
  });

  it("runs once the delay has passed", () => {
    const run = vi.fn();
    const schedule = createDebounced(run, 100);

    schedule();
    vi.advanceTimersByTime(100);

    expect(run).toHaveBeenCalledTimes(1);
  });

  /**
   * The point of the helper: a `git pull` announces one note at a time, and the
   * work each announcement asks for is the same whole-folder listing.
   */
  it("collapses a burst of calls into a single run", () => {
    const run = vi.fn();
    const schedule = createDebounced(run, 100);

    schedule();
    vi.advanceTimersByTime(60);
    schedule();
    vi.advanceTimersByTime(60);
    schedule();
    vi.advanceTimersByTime(100);

    expect(run).toHaveBeenCalledTimes(1);
  });

  it("runs again for a call that arrives after the last run", () => {
    const run = vi.fn();
    const schedule = createDebounced(run, 100);

    schedule();
    vi.advanceTimersByTime(100);
    schedule();
    vi.advanceTimersByTime(100);

    expect(run).toHaveBeenCalledTimes(2);
  });

  it("drops a pending run when cancelled", () => {
    const run = vi.fn();
    const schedule = createDebounced(run, 100);

    schedule();
    schedule.cancel();
    vi.advanceTimersByTime(1000);

    expect(run).not.toHaveBeenCalled();
  });

  it("can be cancelled when nothing is pending", () => {
    const run = vi.fn();
    const schedule = createDebounced(run, 100);

    expect(() => {
      schedule.cancel();
    }).not.toThrow();
    vi.advanceTimersByTime(1000);
    expect(run).not.toHaveBeenCalled();
  });

  /** Cancelling is teardown, not a permanent stop. */
  it("still accepts calls after a cancel", () => {
    const run = vi.fn();
    const schedule = createDebounced(run, 100);

    schedule();
    schedule.cancel();
    schedule();
    vi.advanceTimersByTime(100);

    expect(run).toHaveBeenCalledTimes(1);
  });
});
