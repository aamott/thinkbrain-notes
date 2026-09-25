// @vitest-environment happy-dom

import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { dismissTopOverlay } from "@thinkbrain/ui";
import type { NativeWorkspaceEntry, NativeWorkspaceSnapshot } from "../native/commands";
import { desktopCommandRegistry, type DesktopCommandContext } from "../commands/commandRegistry";
import { WorkspaceExplorer } from "./WorkspaceExplorer";
import { workspaceDesktopApi, type WorkspaceDesktopApi } from "./workspaceAdapter";

vi.mock("./workspaceSettings", () => ({
  DEFAULT_WORKSPACE_SETTINGS: { showHidden: false },
  readWorkspaceSettings: vi.fn(() => Promise.resolve({ showHidden: false })),
  writeWorkspaceSettings: vi.fn(() => Promise.resolve()),
  isWorkspaceGitLinked: vi.fn(() => Promise.resolve(false))
}));

vi.mock("./gitLinkImport", () => ({
  previewWorkspaceFromGitLink: vi.fn(),
  importWorkspaceFromGitLink: vi.fn(),
  subscribeToWorkspaceImport: vi.fn(() => Promise.resolve(() => undefined))
}));

const SNAPSHOT: NativeWorkspaceSnapshot = {
  workspace: { root_path: "/vault", name: "vault" },
  files: []
};

const fileEntry = (relativePath: string): NativeWorkspaceEntry => ({
  relative_path: relativePath,
  name: relativePath.split("/").at(-1) ?? relativePath,
  parent_path: relativePath.includes("/") ? relativePath.slice(0, relativePath.lastIndexOf("/")) : "",
  kind: "file",
  is_markdown: /\.(md|markdown)$/i.test(relativePath),
  byte_size: 0,
  updated_at: null
});

let root: Root | null = null;
let container: HTMLDivElement | null = null;

afterEach(async () => {
  await act(async () => root?.unmount());
  container?.remove();
  root = null;
  container = null;
});

interface ExplorerFixture {
  api: WorkspaceDesktopApi;
  readonly createWorkspaceFile: ReturnType<typeof vi.fn>;
  readonly createWorkspaceFolder: ReturnType<typeof vi.fn>;
  readonly renameWorkspaceEntry: ReturnType<typeof vi.fn>;
  readonly onMarkdownFileCreated: (rootPath: string, relativePath: string) => void;
  readonly onFileSelected: (rootPath: string, relativePath: string) => void;
}

const explorerApi = (entries: readonly NativeWorkspaceEntry[] = []): ExplorerFixture => {
  const createWorkspaceFile = vi.fn(async (_root: string, relativePath: string) => fileEntry(relativePath));
  const createWorkspaceFolder = vi.fn(async () => fileEntry("folder"));
  const renameWorkspaceEntry = vi.fn(async () => fileEntry("renamed.md"));
  const onMarkdownFileCreated = vi.fn<(rootPath: string, relativePath: string) => void>();
  const onFileSelected = vi.fn<(rootPath: string, relativePath: string) => void>();
  const api: WorkspaceDesktopApi = {
    ...workspaceDesktopApi,
    workspaceAccessCapabilities: async () => ({
      canOpenFolder: true,
      canCreateManagedWorkspace: false,
      opensWorkspaceInNewWindow: true
    }),
    openWorkspace: async () => SNAPSHOT,
    listWorkspaceEntries: async () => entries,
    createWorkspaceFile,
    createWorkspaceFolder,
    renameWorkspaceEntry
  };
  return { api, createWorkspaceFile, createWorkspaceFolder, renameWorkspaceEntry, onMarkdownFileCreated, onFileSelected };
};

async function renderExplorer(fixture: ExplorerFixture, props: Record<string, unknown> = {}) {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => {
    root?.render(
      <WorkspaceExplorer
        api={fixture.api}
        initialWorkspacePath="/vault"
        onMarkdownFileCreated={fixture.onMarkdownFileCreated}
        onFileSelected={fixture.onFileSelected}
        {...props}
      />
    );
  });
  // Wait out the workspace open so phase === "ready" before each test body.
  await act(async () => undefined);
  return container;
}

const inputOf = (label: string) =>
  container?.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`) ?? null;

async function click(element: Element) {
  await act(async () => {
    element.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
  });
}

async function openContextMenu(element: Element) {
  await act(async () => {
    element.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true }));
  });
}

async function typeInto(element: HTMLInputElement, value: string) {
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    setter?.call(element, value);
    element.dispatchEvent(new Event("input", { bubbles: true }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

/** Inserts text at the caret, the way typing into the field would. */
async function insertAtCaret(element: HTMLInputElement, text: string) {
  const start = element.selectionStart ?? 0;
  const end = element.selectionEnd ?? 0;
  await typeInto(element, element.value.slice(0, start) + text + element.value.slice(end));
}

async function submit(element: HTMLInputElement) {
  const form = element.closest("form");
  if (!form) throw new Error("input is not inside a form");
  await act(async () => {
    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  });
  await act(async () => undefined);
}

/** Opens the canonical New note flow: the request the `new-note` command sends. */
async function openNewNote(fixture: ExplorerFixture) {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => {
    root?.render(
      <WorkspaceExplorer
        api={fixture.api}
        initialWorkspacePath="/vault"
        onMarkdownFileCreated={fixture.onMarkdownFileCreated}
        onFileSelected={fixture.onFileSelected}
        newNoteFocusRequest={1}
      />
    );
  });
  await act(async () => undefined);
  return container;
}

/** Opens generic New file at the workspace root via the header "..." menu. */
async function openNewFile() {
  const more = container?.querySelector<HTMLButtonElement>('button[aria-label="More actions"]');
  if (!more) throw new Error("More actions button missing");
  await click(more);
  const item = Array.from(container?.querySelectorAll<HTMLButtonElement>("[role='menuitem']") ?? [])
    .find((button) => button.textContent?.includes("New file"));
  if (!item) throw new Error("New file menu item missing");
  await click(item);
}

const dialog = () => document.querySelector<HTMLElement>('[role="dialog"][aria-modal="true"]');

describe("WorkspaceExplorer New note extension flow", () => {
  it("prefills .md with the caret before it, so typing yields Name.md", async () => {
    const fixture = explorerApi();
    await openNewNote(fixture);

    const input = inputOf("New file name");
    expect(input).not.toBeNull();
    expect(input?.value).toBe(".md");
    expect(input?.selectionStart).toBe(0);
    expect(input?.selectionEnd).toBe(0);

    await insertAtCaret(input!, "Shopping");
    expect(input?.value).toBe("Shopping.md");
    await submit(input!);

    expect(fixture.createWorkspaceFile).toHaveBeenCalledWith("/vault", "Shopping.md");
    expect(fixture.onMarkdownFileCreated).toHaveBeenCalledWith("/vault", "Shopping.md");
    expect(inputOf("New file name")).toBeNull();
  });

  it("accepts .markdown case-insensitively and does not prompt", async () => {
    const fixture = explorerApi();
    await openNewNote(fixture);

    const input = inputOf("New file name")!;
    await typeInto(input, "Ideas.MARKDOWN");
    await submit(input);

    expect(fixture.createWorkspaceFile).toHaveBeenCalledWith("/vault", "Ideas.MARKDOWN");
    expect(dialog()).toBeNull();
  });

  it("accepts a mixed-case .md ending without prompting", async () => {
    const fixture = explorerApi();
    await openNewNote(fixture);

    const input = inputOf("New file name")!;
    await typeInto(input, "Ideas.Md");
    await submit(input);

    expect(fixture.createWorkspaceFile).toHaveBeenCalledWith("/vault", "Ideas.Md");
    expect(dialog()).toBeNull();
  });

  it("keeps the field open with a friendly error for an extension-only draft", async () => {
    const fixture = explorerApi();
    await openNewNote(fixture);

    const input = inputOf("New file name")!;
    await submit(input);

    expect(fixture.createWorkspaceFile).not.toHaveBeenCalled();
    expect(container?.textContent).toContain("Give your note a name before .md.");
    // Still mounted, still editable — the draft was never dismissed.
    expect(inputOf("New file name")).toBe(input);
    expect(input?.disabled).toBe(false);

    // The same guard fires for .markdown-only drafts.
    await typeInto(input, ".markdown");
    await submit(input);
    expect(container?.textContent).toContain("Give your note a name before .markdown.");
    expect(fixture.createWorkspaceFile).not.toHaveBeenCalled();
  });

  it("flags an empty New note draft instead of silently cancelling", async () => {
    const fixture = explorerApi();
    await openNewNote(fixture);

    const input = inputOf("New file name")!;
    await typeInto(input, "   ");
    await submit(input);

    expect(fixture.createWorkspaceFile).not.toHaveBeenCalled();
    expect(container?.textContent).toContain("Give your note a name.");
    expect(inputOf("New file name")).not.toBeNull();
  });

  it("clears a stale inline error once the draft is edited or resubmitted", async () => {
    const fixture = explorerApi();
    await openNewNote(fixture);

    const input = inputOf("New file name")!;
    await submit(input);
    expect(container?.textContent).toContain("Give your note a name before .md.");

    await typeInto(input, "Shopping.md");
    expect(container?.textContent).not.toContain("Give your note a name");

    await submit(input);
    expect(fixture.createWorkspaceFile).toHaveBeenCalledWith("/vault", "Shopping.md");
  });

  it("leaves generic New file empty and creates .txt without any prompt", async () => {
    const fixture = explorerApi();
    await renderExplorer(fixture);
    await openNewFile();

    const input = inputOf("New file name");
    expect(input).not.toBeNull();
    expect(input?.value).toBe("");

    await typeInto(input!, "plain.txt");
    await submit(input!);

    expect(fixture.createWorkspaceFile).toHaveBeenCalledWith("/vault", "plain.txt");
    expect(dialog()).toBeNull();
  });

  it("replaces a stale generic draft when the canonical New note command arrives", async () => {
    const fixture = explorerApi();
    await renderExplorer(fixture);
    await openNewFile();
    await typeInto(inputOf("New file name")!, "stale.txt");

    await act(async () => {
      root?.render(
        <WorkspaceExplorer
          api={fixture.api}
          initialWorkspacePath="/vault"
          newNoteFocusRequest={2}
          onMarkdownFileCreated={fixture.onMarkdownFileCreated}
          onFileSelected={fixture.onFileSelected}
        />
      );
    });
    await act(async () => undefined);

    const input = inputOf("New file name");
    expect(input?.value).toBe(".md");
    expect(input?.selectionStart).toBe(0);
    expect(input?.selectionEnd).toBe(0);
  });

  it("keeps generic empty-file cancel and folder creation unchanged", async () => {
    const fixture = explorerApi();
    await renderExplorer(fixture);
    await openNewFile();

    const input = inputOf("New file name")!;
    await submit(input);
    // Generic empty submit stays a silent cancel — no error, field closed.
    expect(inputOf("New file name")).toBeNull();
    expect(fixture.createWorkspaceFile).not.toHaveBeenCalled();
    expect(container?.textContent).not.toContain("Give your note a name");

    const more = container?.querySelector<HTMLButtonElement>('button[aria-label="More actions"]');
    if (!more) throw new Error("More actions button missing");
    await click(more);
    const folderItem = Array.from(container?.querySelectorAll<HTMLButtonElement>("[role='menuitem']") ?? [])
      .find((button) => button.textContent?.includes("New folder"));
    if (!folderItem) throw new Error("New folder menu item missing");
    await click(folderItem);
    const folderInput = inputOf("New folder name");
    if (!folderInput) throw new Error("New folder input missing");
    await typeInto(folderInput, "docs");
    await submit(folderInput);
    expect(fixture.createWorkspaceFolder).toHaveBeenCalledWith("/vault", "docs");
    expect(dialog()).toBeNull();
  });

  it("keeps rename behavior unchanged", async () => {
    const fixture = explorerApi([fileEntry("draft.md")]);
    await renderExplorer(fixture);
    const row = container?.querySelector<HTMLButtonElement>('button[aria-label="Open draft.md"]');
    if (!row) throw new Error("draft row missing");
    await openContextMenu(row);
    const rename = Array.from(document.querySelectorAll<HTMLButtonElement>("[role='menuitem']"))
      .find((button) => button.textContent === "Rename");
    if (!rename) throw new Error("Rename menu item missing");
    await click(rename);

    const input = inputOf("Rename draft.md");
    if (!input) throw new Error("rename input missing");
    await typeInto(input, "published.md");
    await submit(input);

    expect(fixture.renameWorkspaceEntry).toHaveBeenCalledWith("/vault", "draft.md", "published.md");
    expect(inputOf("Rename draft.md")).toBeNull();
  });
});

describe("Create a different file type? confirmation", () => {
  const openPrompt = async (fixture: ExplorerFixture, name = "Shopping.txt") => {
    await openNewNote(fixture);
    const input = inputOf("New file name")!;
    await typeInto(input, name);
    await submit(input);
    return input;
  };

  it("asks before creating a valid non-Markdown name — and creates nothing yet", async () => {
    const fixture = explorerApi();
    await openPrompt(fixture);

    const box = dialog();
    expect(box).not.toBeNull();
    expect(box?.textContent).toContain("Create a different file type?");
    expect(box?.textContent).toContain(
      "The .md ending tells ThinkBrain to open a file as a Markdown note. Without it, this file may open as plain text or in another editor."
    );
    expect(fixture.createWorkspaceFile).not.toHaveBeenCalled();
    // The draft stays mounted behind the dialog, untouched.
    expect(inputOf("New file name")?.value).toBe("Shopping.txt");
    // Keep editing is the focused safe default.
    const keep = Array.from(box?.querySelectorAll("button") ?? []).find((b) => b.textContent === "Keep editing");
    expect(keep).not.toBeNull();
    expect(document.activeElement).toBe(keep);
  });

  it("traps Tab inside the dialog and makes the background inert", async () => {
    const fixture = explorerApi();
    await openPrompt(fixture);

    const box = dialog()!;
    const buttons = Array.from(box.querySelectorAll<HTMLButtonElement>("button"));
    const explorer = container?.querySelector<HTMLElement>('section[aria-label="Workspace explorer"]');
    expect(explorer?.inert).toBe(true);

    // The trap wraps the ends: Shift+Tab on the first lands on the last, Tab
    // on the last lands on the first. Interior movement is plain tab order.
    await act(async () => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", shiftKey: true, bubbles: true, cancelable: true }));
    });
    expect(document.activeElement).toBe(buttons[1]);
    await act(async () => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true }));
    });
    expect(document.activeElement).toBe(buttons[0]);
    await act(async () => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", shiftKey: true, bubbles: true, cancelable: true }));
    });
    expect(document.activeElement).toBe(buttons[1]);

    // Dialog buttons meet touch sizing.
    for (const button of buttons) {
      expect(button.className).toContain("min-h-11");
      expect(button.className).toContain("min-w-11");
    }
  });

  it("Keep editing returns to the unchanged draft", async () => {
    const fixture = explorerApi();
    const input = await openPrompt(fixture);
    const box = dialog()!;
    const keep = Array.from(box.querySelectorAll<HTMLButtonElement>("button")).find((b) => b.textContent === "Keep editing")!;

    await click(keep);

    expect(dialog()).toBeNull();
    const back = inputOf("New file name");
    expect(back).not.toBeNull();
    expect(back?.value).toBe("Shopping.txt");
    expect(document.activeElement).toBe(back);
    expect(fixture.createWorkspaceFile).not.toHaveBeenCalled();
    expect(input).toBe(back);
  });

  it("Escape takes the same safe path", async () => {
    const fixture = explorerApi();
    const input = await openPrompt(fixture);

    await act(async () => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
    });

    expect(dialog()).toBeNull();
    expect(inputOf("New file name")?.value).toBe("Shopping.txt");
    expect(document.activeElement).toBe(input);
    expect(fixture.createWorkspaceFile).not.toHaveBeenCalled();
  });

  it("Android Back via dismissTopOverlay takes the same safe path", async () => {
    const fixture = explorerApi();
    const input = await openPrompt(fixture);

    let dismissed = false;
    await act(async () => {
      dismissed = dismissTopOverlay();
    });

    expect(dismissed).toBe(true);
    expect(dialog()).toBeNull();
    expect(inputOf("New file name")?.value).toBe("Shopping.txt");
    expect(document.activeElement).toBe(input);
    expect(fixture.createWorkspaceFile).not.toHaveBeenCalled();
  });

  it("a scrim tap takes the same safe path", async () => {
    const fixture = explorerApi();
    const input = await openPrompt(fixture);
    const scrim = document.querySelector<HTMLElement>(".bg-overlay");
    expect(scrim).not.toBeNull();

    await click(scrim!);

    expect(dialog()).toBeNull();
    expect(inputOf("New file name")?.value).toBe("Shopping.txt");
    expect(document.activeElement).toBe(input);
    expect(fixture.createWorkspaceFile).not.toHaveBeenCalled();
  });

  it("Create anyway creates exactly once and never selects it as a note", async () => {
    const fixture = explorerApi();
    let finishCreate: ((entry: NativeWorkspaceEntry) => void) | undefined;
    fixture.createWorkspaceFile.mockImplementationOnce(
      async (_root: string, relativePath: string) => new Promise<NativeWorkspaceEntry>((resolve) => {
        finishCreate = resolve;
      }).then(() => fileEntry(relativePath))
    );
    await openPrompt(fixture);
    const create = Array.from(dialog()!.querySelectorAll<HTMLButtonElement>("button"))
      .find((b) => b.textContent === "Create anyway")!;

    await act(async () => {
      create.click();
      create.click();
    });
    expect(fixture.createWorkspaceFile).toHaveBeenCalledTimes(1);
    await act(async () => finishCreate?.(fileEntry("Shopping.txt")));
    await act(async () => undefined);

    expect(fixture.createWorkspaceFile).toHaveBeenCalledWith("/vault", "Shopping.txt");
    expect(fixture.onMarkdownFileCreated).not.toHaveBeenCalled();
    expect(fixture.onFileSelected).not.toHaveBeenCalled();
    expect(dialog()).toBeNull();
    expect(inputOf("New file name")).toBeNull();
  });

  it("keeps the dialog and draft on failure so the create can be retried", async () => {
    const fixture = explorerApi();
    fixture.createWorkspaceFile.mockRejectedValueOnce(new Error("disk full"));
    await openPrompt(fixture, "Shopping.txt");
    const create = Array.from(dialog()!.querySelectorAll<HTMLButtonElement>("button"))
      .find((b) => b.textContent === "Create anyway")!;

    await click(create);
    await act(async () => undefined);

    expect(dialog()).not.toBeNull();
    expect(dialog()?.textContent).toContain("disk full");
    expect(inputOf("New file name")?.value).toBe("Shopping.txt");

    await click(create);
    await act(async () => undefined);

    expect(fixture.createWorkspaceFile).toHaveBeenCalledTimes(2);
    expect(dialog()).toBeNull();
    expect(inputOf("New file name")).toBeNull();
  });

  it("clears a pending or in-flight confirmation when the workspace switches", async () => {
    const fixture = explorerApi();
    let finishCreate: (() => void) | undefined;
    fixture.createWorkspaceFile.mockImplementationOnce(
      async () => new Promise<NativeWorkspaceEntry>((resolve) => {
        finishCreate = () => resolve(fileEntry("Shopping.txt"));
      })
    );
    await openPrompt(fixture);
    const create = Array.from(dialog()!.querySelectorAll<HTMLButtonElement>("button"))
      .find((button) => button.textContent === "Create anyway")!;
    await act(async () => create.click());
    expect(fixture.createWorkspaceFile).toHaveBeenCalledOnce();

    const other: NativeWorkspaceSnapshot = {
      workspace: { root_path: "/other", name: "other" },
      files: []
    };
    fixture.api = { ...fixture.api, openWorkspace: async () => other };
    await act(async () => {
      root?.render(
        <WorkspaceExplorer
          api={fixture.api}
          initialWorkspacePath="/other"
          onMarkdownFileCreated={fixture.onMarkdownFileCreated}
          onFileSelected={fixture.onFileSelected}
        />
      );
    });
    await act(async () => undefined);

    expect(dialog()).toBeNull();
    expect(inputOf("New file name")).toBeNull();
    await act(async () => finishCreate?.());
    await act(async () => undefined);
    expect(dialog()).toBeNull();
    expect(inputOf("New file name")).toBeNull();
  });
});

describe("desktop canonical New note command integration", () => {
  it("invokes the registered command and opens Explorer's prefilled field", async () => {
    const fixture = explorerApi();
    const showExplorer = vi.fn();
    const closePalette = vi.fn();
    const contextBox: { current: DesktopCommandContext | null } = { current: null };
    const Host = () => {
      const [request, setRequest] = useState(0);
      contextBox.current = {
        showExplorer,
        focusNewNote: () => setRequest((value) => value + 1),
        openSearch: vi.fn(),
        toggleTheme: vi.fn(),
        toggleExplorer: vi.fn(),
        toggleOutline: vi.fn(),
        toggleAssistant: vi.fn(),
        toggleBottomPanel: vi.fn(),
        toggleLivePreview: vi.fn(),
        revealPanel: vi.fn(),
        revealLeftPanel: vi.fn(),
        openSettings: vi.fn(),
        rebuildIndex: vi.fn(),
        closePalette
      };
      return (
        <WorkspaceExplorer
          api={fixture.api}
          initialWorkspacePath="/vault"
          newNoteFocusRequest={request}
          onMarkdownFileCreated={fixture.onMarkdownFileCreated}
          onFileSelected={fixture.onFileSelected}
        />
      );
    };
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    await act(async () => root?.render(<Host />));
    await act(async () => undefined);

    const command = desktopCommandRegistry.get("new-note");
    if (!command || !contextBox.current) throw new Error("New note command context missing");
    await act(async () => command.handler(contextBox.current!));
    await act(async () => undefined);

    expect(showExplorer).toHaveBeenCalledOnce();
    expect(closePalette).toHaveBeenCalledWith(false);
    const input = inputOf("New file name");
    expect(input?.value).toBe(".md");
    expect(input?.selectionStart).toBe(0);
    expect(input?.selectionEnd).toBe(0);
  });
});
