// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { NOT_RECORDING, type SyncStatus } from "../sync/historyTypes";
import { StatusBar } from "./StatusBar";

let onSetupSuccess: (() => void) | null = null;

vi.mock("../sync/syncService", () => ({
  subscribeToSetupSuccess: (onChange: () => void) => {
    onSetupSuccess = onChange;
    return Promise.resolve(() => {
      onSetupSuccess = null;
    });
  }
}));

let root: Root | null = null;
let host: HTMLDivElement | null = null;

beforeEach(() => {
  onSetupSuccess = null;
});

afterEach(async () => {
  await act(async () => root?.unmount());
  host?.remove();
  root = null;
  host = null;
  vi.unstubAllGlobals();
});

async function renderBar(
  syncStatus?: SyncStatus,
  onOpenSyncPanel?: (panel: "conflicts" | "history") => void,
  onOpenSettings?: () => void
) {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => {
    root?.render(
      <StatusBar
        workspaceName="Notes"
        syncStatus={syncStatus}
        onOpenSyncPanel={onOpenSyncPanel}
        onOpenSettings={onOpenSettings}
      />
    );
  });
  return host;
}

async function renderProblem(
  onOpenSyncPanel?: (panel: "conflicts" | "history") => void,
  onOpenSettings?: () => void
) {
  return renderBar(
    {
      ...NOT_RECORDING,
      state: "problem",
      problem: {
        code: "sync.auth_required",
        message: "This git link needs a sign-in.",
        details: "TLS certificate verification failed."
      }
    },
    onOpenSyncPanel,
    onOpenSettings
  );
}

function findButton(rendered: ParentNode, label: string): HTMLButtonElement | undefined {
  return Array.from(rendered.querySelectorAll<HTMLButtonElement>("button")).find(
    (button) => button.textContent?.trim() === label
  );
}

describe("sync failure notifications", () => {
  it("shows a sync failure immediately with its recovery action", async () => {
    const rendered = await renderProblem();

    expect(rendered.querySelector('[role="alert"]')?.textContent).toContain("Sync needs attention");
    expect(rendered.textContent).toContain("This git link needs a sign-in.");
    expect(rendered.textContent).toContain("Open saved versions");
    expect(rendered.textContent).toContain("Technical details");
  });

  it("routes an ordinary sync problem to saved versions", async () => {
    const onOpenSyncPanel = vi.fn();
    const onOpenSettings = vi.fn();
    const rendered = await renderProblem(onOpenSyncPanel, onOpenSettings);

    await act(async () => findButton(rendered, "Open saved versions")?.click());

    expect(onOpenSyncPanel).toHaveBeenCalledWith("history");
    expect(onOpenSettings).not.toHaveBeenCalled();
  });

  it("keeps the same failure behind the notifications bell", async () => {
    const onOpenSyncPanel = vi.fn();
    const onOpenSettings = vi.fn();
    const rendered = await renderProblem(onOpenSyncPanel, onOpenSettings);
    const bell = rendered.querySelector<HTMLButtonElement>('button[aria-label="Notifications"]');
    await act(async () => bell?.click());

    const dialog = rendered.querySelector('[role="dialog"]');
    expect(dialog?.textContent).toContain("Sync needs attention");
    expect(dialog?.textContent).toContain(
      "This git link needs a sign-in."
    );

    await act(async () => findButton(dialog!, "Open saved versions")?.click());

    expect(onOpenSyncPanel).toHaveBeenCalledWith("history");
    expect(onOpenSettings).not.toHaveBeenCalled();
  });
});

describe("git link setup success", () => {
  it("toasts after setup, without putting it behind the bell", async () => {
    const rendered = await renderBar();
    await act(async () => onSetupSuccess?.());

    expect(rendered.querySelector('[role="status"]')?.textContent).toContain("Git link is ready");
    expect(rendered.querySelector('[role="status"]')?.textContent).toContain(
      "Notes can now stay in step with this git link."
    );
    expect(rendered.querySelector('[role="alert"]')).toBeNull();

    const bell = rendered.querySelector<HTMLButtonElement>('button[aria-label="Notifications"]');
    await act(async () => bell?.click());
    expect(rendered.querySelector('[role="dialog"]')?.textContent).toContain("No notifications");
    expect(rendered.querySelector('[role="dialog"]')?.textContent).not.toContain("Git link is ready");
  });

  it("does not show a success toast while a problem is present", async () => {
    const rendered = await renderProblem();
    await act(async () => onSetupSuccess?.());

    expect(rendered.querySelector('[role="status"]')).toBeNull();
    expect(rendered.querySelector('[role="alert"]')?.textContent).toContain("Sync needs attention");
  });
});

describe("undo history maintenance notifications", () => {
  it("toasts a tidy failure without claiming sync stopped", async () => {
    const onOpenSyncPanel = vi.fn();
    const onOpenSettings = vi.fn();
    const rendered = await renderBar(
      {
        ...NOT_RECORDING,
        state: "idle",
        maintenanceProblem: {
          code: "sync.history_cleanup_failed",
          message: "Could not tidy the saved undo history on this computer."
        }
      },
      onOpenSyncPanel,
      onOpenSettings
    );

    expect(rendered.querySelector('[role="alert"]')?.textContent).toContain("Could not free space");
    expect(rendered.textContent).toContain("Free space now");
    expect(rendered.querySelector('[role="alert"]')?.textContent).not.toContain("Sync needs attention");
    expect(rendered.textContent).toContain("Open Settings");

    await act(async () => findButton(rendered, "Open Settings")?.click());

    expect(onOpenSettings).toHaveBeenCalledOnce();
    expect(onOpenSyncPanel).not.toHaveBeenCalled();
  });

  it("routes the maintenance notification to Settings with the matching title", async () => {
    const onOpenSyncPanel = vi.fn();
    const onOpenSettings = vi.fn();
    const rendered = await renderBar(
      {
        ...NOT_RECORDING,
        state: "idle",
        maintenanceProblem: {
          code: "sync.history_cleanup_failed",
          message: "Could not tidy the saved undo history on this computer."
        }
      },
      onOpenSyncPanel,
      onOpenSettings
    );
    const bell = rendered.querySelector<HTMLButtonElement>('button[aria-label="Notifications"]');

    await act(async () => bell?.click());

    const dialog = rendered.querySelector('[role="dialog"]');
    expect(dialog?.textContent).toContain("Could not free space");
    expect(dialog?.textContent).not.toContain("Sync needs attention");

    await act(async () => findButton(dialog!, "Open Settings")?.click());

    expect(onOpenSettings).toHaveBeenCalledOnce();
    expect(onOpenSyncPanel).not.toHaveBeenCalled();
  });

  it("copies the maintenance title with the rest of the problem report", async () => {
    const writeText = vi.fn<(text: string) => Promise<void>>().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    const rendered = await renderBar({
      ...NOT_RECORDING,
      state: "idle",
      maintenanceProblem: {
        code: "sync.history_cleanup_failed",
        message: "Could not tidy the saved undo history on this computer."
      }
    });

    await act(async () => findButton(rendered, "Copy")?.click());

    expect(writeText).toHaveBeenCalledWith(
      expect.stringContaining("Could not free space\nCould not tidy the saved undo history")
    );
    expect(writeText.mock.calls[0]?.[0]).not.toContain("Sync needs attention");
  });
});
