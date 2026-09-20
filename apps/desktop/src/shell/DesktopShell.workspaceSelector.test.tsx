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
    deleteWorkspaceEntry: vi.fn()
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
  useSettingsStore.setState({ appValues, stagedChanges, isDirty: false, dirtyCount: 0 });
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
  it("moves the Explorer-owned selector between title bar and eligible panel chrome", async () => {
    const host = await renderShell();

    const titlebarOutlet = host.querySelector('[data-workspace-selector-outlet="titlebar"]');
    const titlebarSelector = titlebarOutlet?.querySelector('button[aria-haspopup="menu"]');
    expect(titlebarSelector).not.toBeNull();
    expect(host.querySelector('[aria-label="Workspace and commands"]')).not.toBeNull();

    const filesAction = host.querySelector<HTMLButtonElement>('[aria-label="Workspace sections"] [aria-label="Files"]');
    await act(async () => filesAction?.click());
    expect(host.querySelector('[data-workspace-selector-outlet="titlebar"] button')).toBe(titlebarSelector);
    await act(async () => filesAction?.click());

    await act(async () => {
      useSettingsStore.getState().stageChange(PLACEMENT_KEY, "panel headers");
    });

    const filesPanel = host.querySelector('[aria-label="Files panel"]');
    const panelOutlet = filesPanel?.querySelector('[data-workspace-selector-outlet="panel"]');
    expect(panelOutlet?.querySelector('button[aria-haspopup="menu"]')).not.toBeNull();
    expect(host.querySelectorAll('button[aria-haspopup="menu"]')).toHaveLength(1);
    expect(host.querySelector('[aria-label="ThinkBrain"]')?.textContent).toContain("ThinkBrain");
    expect(host.querySelector('[aria-label="Workspace and commands"]')).toBeNull();

    await act(async () => {
      host.querySelector<HTMLButtonElement>('[aria-label="Workspace sections"] [aria-label="Extensions"]')?.click();
    });

    expect(host.querySelector('[aria-label="Extensions panel"]')).not.toBeNull();
    expect(host.querySelector('[data-workspace-selector-outlet="panel"]')).toBeNull();
    expect(host.querySelector('button[aria-haspopup="menu"]')).toBeNull();
  });
});
