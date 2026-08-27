// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SettingDefinition } from "@thinkbrain/core";
import { NativeCommandError } from "../../native/commands";
import { useSettingsStore } from "../settingsStore";
import { createSettingsTestHarness } from "../settingsTestHelpers";

const readHistoryUsage = vi.fn<(rootPath: string) => Promise<{ bytes: number }>>();
const freeSyncSpace = vi.fn<(rootPath: string) => Promise<{ bytesBefore: number; bytesAfter: number; reclaimed: number }>>();
const clearUndoHistory = vi.fn<(rootPath: string) => Promise<{ bytesBefore: number; bytesAfter: number; reclaimed: number }>>();

vi.mock("../../sync/syncService", () => ({
  readHistoryUsage: (rootPath: string) => readHistoryUsage(rootPath),
  freeSyncSpace: (rootPath: string) => freeSyncSpace(rootPath),
  clearUndoHistory: (rootPath: string) => clearUndoHistory(rootPath)
}));

const { HistoryPolicyControl } = await import("./HistoryPolicyControl");

const harness = createSettingsTestHarness();

const definition: SettingDefinition = {
  key: "sync.historyPolicy",
  label: "Saved undo history",
  description: "",
  type: "string",
  default: "",
  scope: "app",
  section: "sync.history",
  control: "sync-history-policy"
};

async function renderControl() {
  return harness.render(
    <HistoryPolicyControl definition={definition} value="" onChange={() => undefined} />
  );
}

function button(host: HTMLElement, text: string, exact = false): HTMLButtonElement {
  const found = [...host.querySelectorAll("button")].find((candidate) =>
    exact ? candidate.textContent === text : candidate.textContent?.includes(text)
  );
  if (!found) throw new Error(`No button reading "${text}" among: ${host.textContent}`);
  return found;
}

beforeEach(() => {
  readHistoryUsage.mockReset().mockResolvedValue({ bytes: 12 * 1024 * 1024 });
  freeSyncSpace.mockReset().mockResolvedValue({ bytesBefore: 12_000_000, bytesAfter: 8_000_000, reclaimed: 4_000_000 });
  clearUndoHistory.mockReset().mockResolvedValue({ bytesBefore: 8_000_000, bytesAfter: 7_000_000, reclaimed: 1_000_000 });
  useSettingsStore.setState({ workspaceRootPath: "/notes" });
});

afterEach(async () => {
  await harness.unmount();
  useSettingsStore.setState({ workspaceRootPath: null });
});

describe("HistoryPolicyControl", () => {
  it("shows actual usage and names the retention threshold, not a size cap", async () => {
    const rendered = await renderControl();

    expect(rendered.textContent).toContain("12.0 MB");
    expect(rendered.textContent).toMatch(/90 days/i);
    expect(rendered.textContent).toMatch(/25 MB/);
    expect(rendered.textContent).toMatch(/not a guaranteed size cap/i);
  });

  it("shows the native error when usage cannot be read", async () => {
    readHistoryUsage.mockRejectedValueOnce(
      new NativeCommandError({
        code: "sync.history_usage_failed",
        message: "The folder's undo history could not be inspected."
      })
    );
    const rendered = await renderControl();

    expect(rendered.querySelector('[role="alert"]')?.textContent).toBe(
      "The folder's undo history could not be inspected."
    );
    expect(rendered.textContent).toContain("Reading how much undo history this folder uses");
  });

  it("uses a fallback when usage fails with a generic error", async () => {
    readHistoryUsage.mockRejectedValueOnce(new Error("disk unavailable"));
    const rendered = await renderControl();

    expect(rendered.querySelector('[role="alert"]')?.textContent).toBe(
      "Could not read how much undo history this folder uses."
    );
  });

  it("frees space and reports what came back", async () => {
    const rendered = await renderControl();
    const free = [...rendered.querySelectorAll("button")].find((button) =>
      button.textContent?.includes("Free space now")
    );
    await harness.click(free!);

    expect(freeSyncSpace).toHaveBeenCalledWith("/notes");
    expect(rendered.textContent).toMatch(/Freed/);
  });

  it("reports a free-space failure and re-enables the action", async () => {
    freeSyncSpace.mockRejectedValueOnce(new Error("disk full"));
    const rendered = await renderControl();

    await harness.click(button(rendered, "Free space now"));

    expect(rendered.querySelector('[role="alert"]')?.textContent).toBe(
      "Could not free space. Check this computer has room, then try again."
    );
    expect(button(rendered, "Free space now", true).disabled).toBe(false);
  });

  it("asks before clearing undo history, then keeps notes", async () => {
    const rendered = await renderControl();
    const clear = [...rendered.querySelectorAll("button")].find((button) =>
      button.textContent === "Clear undo history"
    );
    await harness.click(clear!);

    expect(clearUndoHistory).not.toHaveBeenCalled();
    expect(rendered.textContent).toMatch(/cannot be undone/i);
    expect(rendered.textContent).toMatch(/notes and synced history stay/i);

    const confirm = [...rendered.querySelectorAll("button")].find((button) =>
      button.textContent === "Clear undo history"
    );
    await harness.click(confirm!);

    expect(clearUndoHistory).toHaveBeenCalledWith("/notes");
  });

  it("reports a clear failure and leaves the confirmation action recoverable", async () => {
    clearUndoHistory.mockRejectedValueOnce(new Error("disk full"));
    const rendered = await renderControl();

    await harness.click(button(rendered, "Clear undo history", true));
    await harness.click(button(rendered, "Clear undo history", true));

    expect(rendered.querySelector('[role="alert"]')?.textContent).toBe(
      "Could not clear undo history. Check this computer has room, then try again."
    );
    expect(rendered.textContent).not.toContain("This removes saved undo copies");
    expect(button(rendered, "Clear undo history", true).disabled).toBe(false);
  });

  it("explains when no notes folder is open", async () => {
    useSettingsStore.setState({ workspaceRootPath: null });
    const rendered = await renderControl();

    expect(rendered.textContent).toMatch(/Open a notes folder/);
    expect(readHistoryUsage).not.toHaveBeenCalled();
  });
});
