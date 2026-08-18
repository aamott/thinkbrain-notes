// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SyncPill } from "./SyncPill";
import { NOT_RECORDING, type SyncStatus } from "./historyTypes";

let root: Root | null = null;
let container: HTMLDivElement | null = null;

afterEach(async () => {
  await act(async () => root?.unmount());
  container?.remove();
  root = null;
  container = null;
});

const render = async (status: SyncStatus, onOpen = vi.fn()): Promise<HTMLDivElement> => {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root?.render(<SyncPill status={status} onOpen={onOpen} />));
  return container;
};

const state = (over: Partial<SyncStatus>): SyncStatus => ({ ...NOT_RECORDING, state: "idle", ...over });

describe("the footer's sync pill", () => {
  /// The footer is where someone who never opens a panel finds out, so what it
  /// reports it can also take you to.
  it("takes a conflict to the list that can settle it", async () => {
    const onOpen = vi.fn();

    const host = await render(state({ state: "attention", attention: 2 }), onOpen);
    await act(async () => host.querySelector("button")?.click());

    expect(onOpen).toHaveBeenCalledWith("conflicts");
  });

  it("takes everything else to the history", async () => {
    for (const status of [
      state({ state: "idle", lastRecordedAt: Date.now() }),
      state({ state: "saving", waiting: 1 }),
      state({ state: "problem", problem: { code: "sync.commit_failed", message: "Could not save." } })
    ]) {
      const onOpen = vi.fn();
      const host = await render(status, onOpen);
      await act(async () => host.querySelector("button")?.click());
      expect(onOpen).toHaveBeenCalledWith("history");
      await act(async () => root?.unmount());
    }
  });

  /// The pill is a handful of characters; the whole sentence — including what
  /// to do about a failure — has to reach anyone who cannot see it hover.
  it("says the whole of it to a screen reader, not just the short form", async () => {
    const host = await render(
      state({ state: "problem", problem: { code: "sync.note_read_failed", message: "Could not read a note." } })
    );

    const label = host.querySelector("button")?.getAttribute("aria-label") ?? "";
    expect(label).toContain("Could not read a note.");
    expect(label.length).toBeGreaterThan((host.textContent ?? "").length);
  });
});
