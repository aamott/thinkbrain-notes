// @vitest-environment happy-dom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { invokeNativeCommand } from "../native/commands";
import { ThemeProvider } from "../settings/ThemeProvider";
import { useSettingsStore } from "../settings/settingsStore";
import { NOT_RECORDING } from "../sync/historyTypes";
import { useShellState, type ShellState } from "./useShellState";

// The shell state boots the workspace lifecycle, which reaches for Tauri IPC
// when it believes it is running under Tauri. Under happy-dom it is not, but
// mock it explicitly so the restore path is a no-op regardless of environment.
vi.mock("@tauri-apps/api/core", () => ({
  isTauri: vi.fn(() => false)
}));

vi.mock("../native/commands", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../native/commands")>();
  return {
    ...actual,
    invokeNativeCommand: vi.fn(() => Promise.resolve(null))
  };
});

let root: Root | null = null;
let container: HTMLDivElement | null = null;

const invokeMock = vi.mocked(invokeNativeCommand);
const invokeShim = invokeMock as unknown as {
  mockImplementation: (fn: (command: string, args?: Record<string, unknown>) => Promise<unknown>) => void;
};

/**
 * Answers the commands opening a workspace reaches for. Everything else keeps
 * the harness's null answer — `restore_version` included, so the tests can
 * still assert it was (or was not) invoked.
 */
const answerNativeCommands = (): void => {
  invokeShim.mockImplementation(async (command: string, args?: Record<string, unknown>) => {
    if (command === "read_markdown_file") {
      return { relative_path: args?.relativePath, contents: "# Note\n\nSome text." };
    }
    if (command === "read_text_file") {
      return { relative_path: args?.relativePath, contents: "print(1)\n" };
    }
    if (command === "write_text_file") {
      return {
        relative_path: args?.relativePath,
        file_name: "script.py",
        parent_path: "",
        byte_size: 1,
        updated_at: null
      };
    }
    if (command === "sync_status") {
      return { ...NOT_RECORDING, state: "idle" };
    }
    if (command === "sync_history") return [];
    if (command === "sync_conflict_rate") return { decisions: 0, settled: 0, recorded: 0 };
    if (command === "list_conflicts") return [];
    if (command === "quarantined_settings") return [];
    return null;
  });
};

afterEach(async () => {
  await act(async () => root?.unmount());
  container?.remove();
  root = null;
  container = null;
  invokeMock.mockClear();
  answerNativeCommands();
  useSettingsStore.getState().setActiveSection(null);
});

answerNativeCommands();

/**
 * Renders the hook with no chrome and hands back its latest value.
 *
 * The point of the extraction is that shell state runs without `DesktopShell`,
 * so the probe renders nothing at all. `ThemeProvider` is still required —
 * `useShellState` consumes `useTheme()` for the theme-toggle command.
 */
async function renderShellState(): Promise<() => ShellState> {
  // A box rather than a bare `let`: assigning inside the render callback does
  // not narrow, and TypeScript would otherwise read the variable as `null`.
  const box: { current: ShellState | null } = { current: null };
  function Probe(): null {
    box.current = useShellState();
    return null;
  }
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => {
    root?.render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>
    );
  });
  return () => {
    if (!box.current) throw new Error("useShellState did not render");
    return box.current;
  };
}

/** Pretends the explorer just opened /vault — the only supported way a root path lands in shell state. */
const openWorkspace = async (state: () => ShellState): Promise<void> => {
  const onWorkspaceOpened = state().explorerProps.onWorkspaceOpened;
  if (!onWorkspaceOpened) throw new Error("explorerProps.onWorkspaceOpened is not wired");
  await act(async () =>
    onWorkspaceOpened("/vault", {
      workspace: { root_path: "/vault", name: "vault" },
      files: []
    })
  );
};

describe("useShellState", () => {
  it("provides shell state without any chrome mounted", async () => {
    const state = await renderShellState();

    expect(state().tabState.tabs).toEqual([]);
    expect(state().leftPanel).toBe("explorer");
    expect(state().rightPanel).toBeNull();
    expect(state().paletteOpen).toBe(false);
  });

  it("opens and closes the command palette", async () => {
    const state = await renderShellState();

    await act(async () => state().openPalette());
    expect(state().paletteOpen).toBe(true);

    await act(async () => state().closePalette(false));
    expect(state().paletteOpen).toBe(false);
  });

  it("opens a settings tab through the shared action", async () => {
    const state = await renderShellState();

    await act(async () => state().openSettingsTab());

    expect(state().tabState.tabs.map((tab) => tab.id)).toContain("settings");
  });

  it("toggles a right panel on and off", async () => {
    const state = await renderShellState();

    await act(async () => state().toggleRightPanel("outline"));
    expect(state().rightPanel).toBe("outline");

    await act(async () => state().toggleRightPanel("outline"));
    expect(state().rightPanel).toBeNull();
  });

  it("opens a file and reveals its Version history from the explorer", async () => {
    const state = await renderShellState();

    await act(async () => state().showVersionsOf("/vault", "note.md"));

    expect(state().tabState.tabs.map((tab) => tab.kind)).toContain("editor");
    expect(state().rightPanel).toBe("history");
  });

  it("opens a non-Markdown file by its inferred kind for Previous versions", async () => {
    const state = await renderShellState();

    await act(async () => state().showVersionsOf("/vault", "photo.png"));

    expect(state().tabState.tabs[0]?.kind).toBe("image-viewer");
    expect(state().rightPanel).toBe("history");
  });

  it("routes sync surfaces to opposite docks", async () => {
    const state = await renderShellState();

    await act(async () => state().openSyncPanel("history"));
    expect(state().rightPanel).toBe("history");

    await act(async () => state().openSyncPanel("conflicts"));
    expect(state().leftPanel).toBe("conflicts");
    // History stays where it was — opening conflicts must not close it.
    expect(state().rightPanel).toBe("history");
  });

  it("opens a read-only version comparison as a normal tab", async () => {
    const state = await renderShellState();
    await openWorkspace(state);

    await act(async () => state().compareVersion("note.md", "chg-1"));

    const tab = state().tabState.tabs.find((candidate) => candidate.kind === "version-diff");
    expect(tab).toMatchObject({
      comparedNotePath: "note.md",
      versionChangeId: "chg-1"
    });
    expect(state().tabState.activeTabId).toBe(tab?.id);
  });

  it("closes the Version history inspector when a comparison opens", async () => {
    const state = await renderShellState();
    await openWorkspace(state);
    await act(async () => state().openSyncPanel("history"));
    expect(state().rightPanel).toBe("history");

    await act(async () => state().compareVersion("note.md", "chg-1"));

    expect(state().rightPanel).toBeNull();
    expect(state().tabState.tabs.some((tab) => tab.kind === "version-diff")).toBe(true);
  });

  it("restores a version through the native command when nothing is dirty", async () => {
    const state = await renderShellState();
    await openWorkspace(state);

    await act(async () => state().restoreVersionSafely("note.md", "chg-1"));

    expect(invokeMock).toHaveBeenCalledWith(
      "restore_version",
      expect.objectContaining({ rootPath: "/vault", notePath: "note.md", change: "chg-1" })
    );
  });

  it("saves, restores, and reloads a dirty code-editor through the text-file path", async () => {
    const state = await renderShellState();
    await openWorkspace(state);
    await act(async () => state().openFileDocument("/vault", "script.py"));
    const tab = state().tabState.tabs.find((candidate) => candidate.kind === "code-editor")!;
    await act(async () => state().updateDocument(tab.id, "edited\n"));
    expect(state().tabState.tabs.find((candidate) => candidate.id === tab.id)?.isDirty).toBe(true);

    await act(async () => state().restoreVersionSafely("script.py", "chg-1"));

    const commands = invokeMock.mock.calls.map(([command]) => command);
    // Save first, native restore second — in that order.
    expect(commands.indexOf("write_text_file")).toBeLessThan(commands.indexOf("restore_version"));
    // The open read plus the post-restore reload are both text reads; the
    // Markdown reader must never touch a code-editor's file.
    expect(commands.filter((command) => command === "read_text_file")).toHaveLength(2);
    expect(invokeMock).not.toHaveBeenCalledWith("read_markdown_file", expect.anything());
    // The reducer stores a clean tab's dirty flag as undefined, not false.
    expect(state().tabState.tabs.find((candidate) => candidate.id === tab.id)?.isDirty).toBeFalsy();
  });

  it("refuses to restore over unsaved edits it cannot save", async () => {
    const state = await renderShellState();
    await openWorkspace(state);
    // The write refuses, so the shell has a dirty tab it cannot save — exactly
    // the refusal the restore must honor.
    invokeShim.mockImplementation(async (command: string, args?: Record<string, unknown>) => {
      if (command === "write_markdown_file") throw new Error("disk full");
      if (command === "read_markdown_file") {
        return { relative_path: args?.relativePath, contents: "# Note\n\nSome text." };
      }
      if (command === "sync_status") return { ...NOT_RECORDING, state: "idle" };
      if (command === "sync_conflict_rate") return { decisions: 0, settled: 0, recorded: 0 };
      if (command === "list_conflicts") return [];
      if (command === "quarantined_settings") return [];
      return null;
    });
    await act(async () => state().openMarkdownDocument("/vault", "note.md"));
    const tab = state().tabState.tabs.find((candidate) => candidate.kind === "editor")!;
    await act(async () => state().updateDocument(tab.id, "unsaved edits"));

    let caught: unknown = null;
    await act(async () => {
      caught = await state()
        .restoreVersionSafely("note.md", "chg-1")
        .then(
          () => null,
          (error: unknown) => error
        );
    });
    expect(caught).toBeInstanceOf(Error);
    expect((caught as Error).message).toContain("Save the current file");

    expect(invokeMock).not.toHaveBeenCalledWith("restore_version", expect.anything());
    expect(state().tabState.tabs.find((candidate) => candidate.id === tab.id)?.isDirty).toBe(true);
  });

  it("opens settings at the sync section from the conflicts menu", async () => {
    const state = await renderShellState();

    await act(async () => state().openSyncSettings());

    expect(state().tabState.tabs.map((tab) => tab.id)).toContain("settings");
    expect(useSettingsStore.getState().activeSection).toBe("workspace:sync.destination");
  });
});
