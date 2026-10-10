// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ThemeProvider } from "../settings/ThemeProvider";
import { DesktopShell } from "./DesktopShell";
import { useShellState, type ShellState } from "./useShellState";

vi.mock("@tauri-apps/api/core", () => ({ isTauri: vi.fn(() => false) }));
vi.mock("../native/commands", () => ({
  // Desktop-shaped capabilities so the keepMounted explorer publishes its
  // onboarding actions; every other command keeps the null default.
  invokeNativeCommand: vi.fn(async (command: string) => {
    if (command === "workspace_access_capabilities") {
      return { canOpenFolder: true, canCreateManagedWorkspace: false, opensWorkspaceInNewWindow: true };
    }
    return null;
  })
}));

let root: Root | null = null;
let container: HTMLDivElement | null = null;
let live: ShellState | null = null;

const mount = async (): Promise<HTMLDivElement> => {
  const Host = () => {
    live = useShellState();
    return <DesktopShell shell={live} />;
  };
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => {
    root?.render(
      <ThemeProvider>
        <Host />
      </ThemeProvider>
    );
  });
  return container;
};

afterEach(async () => {
  await act(async () => root?.unmount());
  container?.remove();
  root = null;
  container = null;
  live = null;
});

const shell = (): ShellState => {
  if (!live) throw new Error("shell did not render");
  return live;
};

// Scoped to the tab surface: the keepMounted explorer renders its own
// "Open folder…" button in the empty state, so a host-wide lookup can hit it.
const landingButton = (host: HTMLDivElement, label: string): HTMLButtonElement | undefined =>
  [...(host.querySelector("article")?.querySelectorAll<HTMLButtonElement>("button") ?? [])].find(
    (button) => button.textContent?.includes(label)
  );

describe("the landing tab with no workspace", () => {
  it("offers the workspace create/open entry points instead of note actions", async () => {
    const host = await mount();
    await act(async () => shell().openNewTab());

    expect(landingButton(host, "Open folder")).toBeDefined();
    expect(landingButton(host, "Bring in from Git link")).toBeDefined();
    expect(landingButton(host, "New note")).toBeUndefined();
    expect(landingButton(host, "Search workspace")).toBeUndefined();
  });

  it("opens the shell-level git-link dialog without surfacing the explorer", async () => {
    const host = await mount();
    // Hide the dock: shell-level dialogs no longer need the explorer visible.
    await act(async () => shell().setLeftPanel(null));
    await act(async () => shell().openNewTab());

    await act(async () => landingButton(host, "Bring in from Git link")?.click());
    await act(async () => undefined);

    expect(document.querySelector('[role="dialog"]')).not.toBeNull();
    expect(shell().leftPanel).toBeNull();
  });
});
