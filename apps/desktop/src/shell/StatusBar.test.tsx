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
});

async function renderBar(syncStatus?: SyncStatus) {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () =>
    root?.render(<StatusBar workspaceName="Notes" syncStatus={syncStatus} />)
  );
  return host;
}

async function renderProblem() {
  return renderBar({
    ...NOT_RECORDING,
    state: "problem",
    problem: {
      code: "sync.auth_required",
      message: "This git link needs a sign-in.",
      details: "TLS certificate verification failed."
    }
  });
}

describe("sync failure notifications", () => {
  it("shows a sync failure immediately with its recovery action", async () => {
    const rendered = await renderProblem();

    expect(rendered.querySelector('[role="alert"]')?.textContent).toContain("Sync needs attention");
    expect(rendered.textContent).toContain("This git link needs a sign-in.");
    expect(rendered.textContent).toContain("Open Settings");
    expect(rendered.textContent).toContain("Technical details");
  });

  it("keeps the same failure behind the notifications bell", async () => {
    const rendered = await renderProblem();
    const bell = rendered.querySelector<HTMLButtonElement>('button[aria-label="Notifications"]');
    await act(async () => bell?.click());

    expect(rendered.querySelector('[role="dialog"]')?.textContent).toContain("This git link needs a sign-in.");
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
