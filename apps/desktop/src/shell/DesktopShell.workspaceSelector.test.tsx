// @vitest-environment happy-dom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@tauri-apps/api/core", () => ({
  isTauri: vi.fn(() => false)
}));

vi.mock("../native/commands", () => ({
  invokeNativeCommand: vi.fn(() => Promise.resolve(null))
}));

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
    deleteWorkspaceEntry: vi.fn(),
    listKnownWorkspaces: vi.fn(async () => []),
    workspaceAccessCapabilities: vi.fn(async () => ({
      canOpenFolder: true,
      canCreateManagedWorkspace: true,
      opensWorkspaceInNewWindow: true
    }))
  }
}));

vi.mock("../workspace/workspaceDocumentAdapter", () => ({
  workspaceDocumentApi: {
    readDocument: vi.fn(),
    writeDocument: vi.fn(),
    createDocument: vi.fn()
  }
}));

import { ThemeProvider } from "../settings/ThemeProvider";
import { useSettingsStore } from "../settings/settingsStore";
import { DesktopShell } from "./DesktopShell";
import { useShellState } from "./useShellState";

const PLACEMENT_KEY = "ui.workspaceSelectorPlacement";
let root: Root | null = null;
let container: HTMLDivElement | null = null;

function clearPlacement(): void {
  const appValues = { ...useSettingsStore.getState().appValues };
  const stagedChanges = { ...useSettingsStore.getState().stagedChanges };
  delete appValues[PLACEMENT_KEY];
  delete stagedChanges[PLACEMENT_KEY];
  useSettingsStore.setState({ appValues, stagedChanges });
}

afterEach(async () => {
  await act(async () => root?.unmount());
  container?.remove();
  root = null;
  container = null;
  clearPlacement();
});

async function renderShell(): Promise<HTMLDivElement> {
  const Host = () => <DesktopShell shell={useShellState()} />;
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
}

describe("DesktopShell workspace selector placement", () => {
  it("mounts the selector in the title bar by default and in panel chrome when placed there", async () => {
    const host = await renderShell();

    // Title-bar placement: the trigger sits in the top chrome, not the explorer.
    const titlebar = host.querySelector("header.bg-titlebar");
    const titlebarSelector = titlebar?.querySelector('button[aria-haspopup="menu"]');
    expect(titlebarSelector?.textContent).toContain("Choose workspace");
    const filesPanel = host.querySelector('[aria-label="Files panel"]');
    expect(filesPanel?.querySelector('header button[aria-haspopup="menu"]')).toBeNull();

    await act(async () => {
      useSettingsStore.getState().stageChange(PLACEMENT_KEY, "panel headers");
    });

    // Panel-headers placement: the explorer draws the selector in its own
    // chrome row; the title bar no longer carries one.
    const panelSelector = filesPanel?.querySelector('header button[aria-haspopup="menu"]');
    expect(panelSelector?.textContent).toContain("Choose workspace");
    expect(titlebar?.querySelector('button[aria-haspopup="menu"]')).toBeNull();

    // Other opted-in popouts (Search) draw their own trigger in the title
    // slot — a second instance sharing the one shell-level controller.
    await act(async () => {
      host.querySelector<HTMLButtonElement>('[aria-label="Workspace sections"] [aria-label="Search"]')?.click();
    });
    const searchPanel = host.querySelector('[aria-label="Search panel"]');
    expect(searchPanel?.querySelector('button[aria-haspopup="menu"]')?.textContent).toContain("Choose workspace");
  });

  it("opens the workspace manager from the title-bar selector without the explorer", async () => {
    const host = await renderShell();
    // Collapse the Files dock: the popout stays mounted under aria-hidden, so
    // the dialog must not be rendered inside it.
    await act(async () => {
      host.querySelector<HTMLButtonElement>('[aria-label="Workspace sections"] [aria-label="Files"]')?.click();
    });

    const trigger = host.querySelector<HTMLButtonElement>('header.bg-titlebar button[aria-haspopup="menu"]');
    expect(trigger).not.toBeNull();
    await act(async () => trigger!.click());

    const manage = Array.from(document.querySelectorAll<HTMLElement>('[role="menuitem"], [role="menu"] *'))
      .find((el) => el.textContent?.includes("Manage workspaces"));
    expect(manage).toBeDefined();
    await act(async () => manage!.click());
    await act(async () => undefined);

    const dialog = document.querySelector('[role="dialog"]');
    expect(dialog).not.toBeNull();
    expect(dialog?.closest('[aria-hidden="true"]')).toBeNull();
  });
});
