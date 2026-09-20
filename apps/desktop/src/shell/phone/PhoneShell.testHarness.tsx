// @vitest-environment happy-dom
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, expect, vi } from "vitest";

import { invokeNativeCommand } from "../../native/commands";
import { useSettingsStore } from "../../settings/settingsStore";
import { ThemeProvider } from "../../settings/ThemeProvider";
import { workspaceDocumentApi } from "../../workspace/workspaceDocumentAdapter";
import { useShellState, type ShellState } from "../useShellState";
import { PhoneShell } from "./PhoneShell";

// `useShellState` boots the workspace lifecycle and reaches for Tauri IPC when
// it believes it is running under Tauri. Mock both so the restore path is a
// no-op, matching `ShellRoot.test.tsx` and `useShellState.test.tsx`.
vi.mock("@tauri-apps/api/core", () => ({
  isTauri: vi.fn(() => false)
}));

// The load path dereferences what the adapter returns, and the native-command
// mock resolves to null. Hand it a real document so opening a note works.
vi.mock("../../workspace/workspaceDocumentAdapter", () => ({
  workspaceDocumentApi: {
    readMarkdownDocument: vi.fn(() =>
      Promise.resolve({
        rootPath: "/vault",
        relativePath: "note.md",
        contents: "# Note\n\nSome text.",
        modifiedAtMs: 0
      })
    ),
    writeMarkdownDocument: vi.fn(() =>
      Promise.resolve({
        relative_path: "note.md",
        file_name: "note.md",
        parent_path: "",
        byte_size: 0,
        updated_at: null
      })
    ),
    createMarkdownDocument: vi.fn()
  }
}));

vi.mock("../../native/commands", () => ({
  invokeNativeCommand: vi.fn(() => Promise.resolve(null))
}));

// The module mock above installs a bare `vi.fn`, so grab it back through the
// (generic) real signature to give implementations room to answer per command.
const nativeCommands = () =>
  invokeNativeCommand as unknown as {
    mockImplementation: (fn: (command: string) => Promise<unknown>) => void;
    mockReset: () => void;
  };

/**
 * Answers the two commands the Android managed-vault flow probes —
 * capabilities and the managed list — while every other command keeps the
 * harness's default null answer. Call before `render`/`renderWithShell`.
 */
export const mockManagedWorkspaceAccess = (): void => {
  nativeCommands().mockImplementation(async (command: string) => {
    if (command === "workspace_access_capabilities") {
      return { canOpenFolder: false, canCreateManagedWorkspace: true, opensWorkspaceInNewWindow: false };
    }
    if (command === "list_managed_workspaces") return [];
    return null;
  });
};

let root: Root | null = null;
let container: HTMLDivElement | null = null;

afterEach(async () => {
  await unmount();
  container?.remove();
  vi.unstubAllGlobals();
  vi.useRealTimers();
  nativeCommands().mockReset();
  nativeCommands().mockImplementation(() => Promise.resolve(null));
  vi.mocked(workspaceDocumentApi.writeMarkdownDocument).mockClear();
  clearStoredHub();
  container = null;
});

/**
 * The settings store is a module singleton and the hub edits below really do
 * persist: `invokeNativeCommand` is mocked to resolve, so a save "succeeds" and
 * lands in `appValues`. Left there, one test's pin would be the next test's
 * starting hub. Only the hub key is cleared — blanking the store wholesale
 * would take the theme and desktop state with it.
 */
function clearStoredHub(): void {
  const appValues = { ...useSettingsStore.getState().appValues };
  delete appValues["ui.mobileHub"];
  useSettingsStore.setState({ appValues, stagedChanges: {}, isDirty: false, dirtyCount: 0 });
}

/** Seeds the persisted hub before a mount, the way a returning user would find it. */
export function storeHub(items: readonly unknown[]): void {
  useSettingsStore.getState().stageChange("ui.mobileHub", JSON.stringify(items));
}

export const hubOf = (host: HTMLDivElement): Element | null =>
  host.querySelector('[aria-label="Primary navigation"]');

export const drawerOf = (host: HTMLDivElement): Element | null =>
  host.querySelector('[aria-label="Navigation"]');

/** Hub slot labels, in bar order — the assertion pin/remove actually needs. */
export const hubLabels = (host: HTMLDivElement): readonly (string | null)[] =>
  [...(hubOf(host)?.querySelectorAll("button") ?? [])].map((button) =>
    button.getAttribute("aria-label")
  );

export const mount = async (node: ReactNode): Promise<HTMLDivElement> => {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => {
    root?.render(<ThemeProvider>{node}</ThemeProvider>);
  });
  return container;
};

export const unmount = async (): Promise<void> => {
  await act(async () => root?.unmount());
  root = null;
};

/**
 * Mounts `PhoneShell` over real shell state, as `ShellRoot` does.
 *
 * `ThemeProvider` is not decoration: `useShellState` reads `useTheme()` for the
 * theme-toggle command and throws outside the provider.
 */
export const render = async (): Promise<HTMLDivElement> => {
  const Host = () => <PhoneShell shell={useShellState()} />;
  return mount(<Host />);
};

/**
 * Same mount, but hands the test the live shell so it can open and edit a note.
 * Reaching a dirty tab any other way would mean faking the reducer.
 */
export const renderWithShell = async (): Promise<{
  host: HTMLDivElement;
  shell: () => ShellState;
}> => {
  const box: { current: ShellState | null } = { current: null };
  const Host = () => {
    const shell = useShellState();
    box.current = shell;
    return <PhoneShell shell={shell} />;
  };
  const host = await mount(<Host />);
  return {
    host,
    shell: () => {
      if (!box.current) throw new Error("PhoneShell did not render");
      return box.current;
    }
  };
};

export const click = async (host: HTMLDivElement, label: string): Promise<void> => {
  await act(async () => {
    host.querySelector<HTMLButtonElement>(`[aria-label="${label}"]`)?.click();
  });
};

/** Finds a dialog by label that is actually visible (not `aria-hidden`).
 *  Drawer/BottomSheet are always mounted for slide transitions, so a closed
 *  dialog is still in the DOM — `toBeNull` on the selector alone can't tell
 *  open from closed. */
export const visibleDialog = (host: HTMLElement, label: string): Element | null => {
  // `role="dialog"` is only set when open (closed overlays omit it to avoid
  // contradicting `aria-hidden`), so query by `aria-label` alone and check
  // `aria-hidden` to determine visibility.
  const el = host.querySelector(`[aria-label="${label}"][aria-hidden]`);
  return el?.getAttribute("aria-hidden") === "true" ? null : el;
};

// The header's `⋯` button is labelled "Document tools", the menu it opens is
// "Action items" (role="menu"), and the inspector it drills into is the
// "Inspector" dialog — three distinct surfaces, matched by their own labels.
export const inspector = (host: HTMLDivElement): Element | null =>
  visibleDialog(host, "Inspector");
export const actionsMenu = (host: HTMLDivElement): Element | null =>
  host.querySelector('[role="menu"][aria-label="Action items"][aria-hidden="false"]')
  ?? host.querySelector('[role="menu"][aria-label="Action items"]:not([aria-hidden="true"])');

/** The explorer surface, visible only while its wrapper is not aria-hidden. */
export const filesPanel = (host: HTMLDivElement): Element | null =>
  host.querySelector('[aria-label="Files panel"]');
export const filesVisible = (host: HTMLDivElement): boolean =>
  filesPanel(host)?.closest('[aria-hidden="true"]') == null && filesPanel(host) != null;
export const noteTitle = (host: HTMLDivElement): HTMLInputElement | null =>
  host.querySelector<HTMLInputElement>('[aria-label="Note title"]');
export const noteTitleVisible = (host: HTMLDivElement): boolean =>
  noteTitle(host)?.closest('[aria-hidden="true"]') == null && noteTitle(host) != null;
export const locationPill = (host: HTMLDivElement): string | null | undefined =>
  host.querySelector('header [aria-label="Current location"]')?.textContent;
export const backButton = (host: HTMLDivElement): HTMLButtonElement | null =>
  host.querySelector<HTMLButtonElement>('header [aria-label="Back"]');
export const forwardButton = (host: HTMLDivElement): HTMLButtonElement | null =>
  host.querySelector<HTMLButtonElement>('header [aria-label="Forward"]');

export const newNoteMenu = (host: HTMLDivElement): Element | null =>
  host.querySelector('[role="menu"][aria-label="New note actions"]');

/**
 * Waits until the note has actually loaded. Autosave writes through
 * `saveDocument`, which refuses a tab still in `loading`.
 */
export const openReadyNote = async (
  shell: () => ShellState,
  relativePath: string = "note.md"
): Promise<string> => {
  await act(async () => shell().openMarkdownDocument("/vault", relativePath));
  const tabId = shell().tabState.tabs.find((tab) => tab.resource?.relativePath === relativePath)?.id;
  expect(tabId).toBeDefined();
  // `openMarkdownDocument` loads in a fire-and-forget `.then`; drain
  // microtasks until the mocked read lands so `saveDocument` sees a ready tab.
  for (let i = 0; i < 10 && shell().documents[tabId!]?.phase !== "ready"; i++) {
    await act(async () => {
      await Promise.resolve();
    });
  }
  expect(shell().documents[tabId!]?.phase).toBe("ready");
  return tabId!;
};

export const writeMock = (): ReturnType<typeof vi.mocked<typeof workspaceDocumentApi.writeMarkdownDocument>> =>
  vi.mocked(workspaceDocumentApi.writeMarkdownDocument);
