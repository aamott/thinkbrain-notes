// @vitest-environment happy-dom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { NativeKnownWorkspace, NativeWorkspaceAccessCapabilities } from "../native/commands";
import { WorkspaceManagerDialog } from "./WorkspaceManagerDialog";

vi.mock("./workspaceSettings", () => ({
  isWorkspaceGitLinked: vi.fn((path: string) => Promise.resolve(path.includes("git-linked")))
}));

const desktopCapabilities: NativeWorkspaceAccessCapabilities = {
  canOpenFolder: true,
  canCreateManagedWorkspace: false,
  opensWorkspaceInNewWindow: true
};

const workspaces: NativeKnownWorkspace[] = [
  { rootPath: "/notes/current", name: "Current", kind: "external", missing: false },
  { rootPath: "/notes/work", name: "Work", kind: "external", missing: false },
  { rootPath: "/vaults/Recipes", name: "Recipes", kind: "managed", missing: false },
  { rootPath: "/old/vault", name: "Old Vault", kind: "external", missing: true }
];

let root: Root | null = null;
let container: HTMLDivElement | null = null;

afterEach(async () => {
  await act(async () => root?.unmount());
  container?.remove();
  root = null;
  container = null;
});

const dialogs = () =>
  Array.from(document.querySelectorAll<HTMLElement>('[role="dialog"][aria-modal="true"]'));
const topDialog = () => dialogs().at(-1) ?? null;

async function renderDialog(overrides: Partial<Parameters<typeof WorkspaceManagerDialog>[0]> = {}) {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  const props = {
    workspaces,
    capabilities: desktopCapabilities,
    currentPath: "/notes/current",
    error: null as string | null,
    onClearError: vi.fn(),
    onClose: vi.fn(),
    onOpenFolder: vi.fn(),
    onCreateWorkspace: vi.fn(),
    onImportFromGit: vi.fn(),
    onOpenWorkspace: vi.fn(),
    onForgetWorkspace: vi.fn(),
    onDeleteWorkspace: vi.fn(async () => true),
    ...overrides
  };
  await act(async () => {
    root?.render(<WorkspaceManagerDialog {...props} />);
  });
  await act(async () => undefined);
  return props;
}

async function click(element: Element | null | undefined) {
  if (!element) throw new Error("Expected element to exist");
  await act(async () => {
    element.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
  });
}

async function typeInto(element: HTMLInputElement, value: string) {
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    setter?.call(element, value);
    element.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

const rowCount = () => topDialog()?.querySelectorAll("li").length ?? 0;

function rowNamed(name: string): HTMLElement {
  const row = Array.from(document.querySelectorAll("li")).find((li) =>
    li.textContent?.includes(name)
  );
  if (!row) throw new Error(`No row for ${name}`);
  return row;
}

describe("WorkspaceManagerDialog", () => {
  it("lists workspace names with current and missing badges", async () => {
    await renderDialog();
    const box = topDialog()!;
    expect(box.textContent).toContain("Workspaces");
    for (const name of ["Current", "Work", "Recipes", "Old Vault"]) {
      expect(box.textContent).toContain(name);
    }
    expect(rowNamed("Current").textContent).toContain("This window");
    expect(rowNamed("Old Vault").textContent).toContain("Folder missing");
    expect(rowNamed("Work").textContent).toContain("/notes/work");
  });

  it("disables open on the current workspace and gives it no removal", async () => {
    await renderDialog();
    const row = rowNamed("Current");
    const buttons = Array.from(row.querySelectorAll("button"));
    expect(buttons).toHaveLength(1);
    expect(buttons[0]?.disabled).toBe(true);
  });

  it("disables open on a missing folder but keeps its remove action", async () => {
    const props = await renderDialog();
    const row = rowNamed("Old Vault");
    const open = row.querySelectorAll("button")[0];
    expect(open?.disabled).toBe(true);
    await click(row.querySelector('button[aria-label="Remove Old Vault from list"]'));
    expect(props.onForgetWorkspace).toHaveBeenCalledWith("/old/vault");
  });

  it("marks a root open in another window and routes its row to focus", async () => {
    const props = await renderDialog({ openElsewhere: ["/notes/work"] });
    const row = rowNamed("Work");
    expect(row.textContent).toContain("Open in another window");
    expect(row.textContent).toContain("Focus");
    await click(row.querySelectorAll("button")[0]);
    expect(props.onOpenWorkspace).toHaveBeenCalledWith("/notes/work");
    expect(props.onClose).toHaveBeenCalledOnce();
  });

  it("opens an existing workspace through the row's main button", async () => {
    const props = await renderDialog();
    const row = rowNamed("Work");
    await click(row.querySelectorAll("button")[0]);
    expect(props.onOpenWorkspace).toHaveBeenCalledWith("/notes/work");
    expect(props.onClose).toHaveBeenCalledOnce();
  });

  it("filters by name and path, case-insensitively", async () => {
    await renderDialog();
    const filter = topDialog()?.querySelector<HTMLInputElement>("input[aria-label='Filter workspaces']");
    await typeInto(filter!, "old");
    expect(topDialog()?.textContent).toContain("Old Vault");
    expect(topDialog()?.textContent).not.toContain("Recipes");
    await typeInto(filter!, "/VAULTS/");
    expect(topDialog()?.textContent).toContain("Recipes");
    expect(rowCount()).toBe(1);
    await typeInto(filter!, "zzz");
    expect(topDialog()?.textContent).toContain("No workspaces match");
  });

  it("marks Git-linked workspaces accessibly", async () => {
    await renderDialog({
      workspaces: [{ rootPath: "/notes/git-linked", name: "Linked", kind: "external", missing: false }]
    });
    const row = rowNamed("Linked");
    expect(row.querySelector(".lucide-folder-git2")).not.toBeNull();
    expect(row.textContent).toContain("Git-linked");
  });

  it("routes header actions through close-then-action", async () => {
    const props = await renderDialog();
    await click(
      Array.from(topDialog()!.querySelectorAll("button")).find((b) => b.textContent === "Open folder…")
    );
    expect(props.onClose).toHaveBeenCalledOnce();
    expect(props.onOpenFolder).toHaveBeenCalledOnce();
    expect(vi.mocked(props.onClose).mock.invocationCallOrder[0]!).toBeLessThan(
      vi.mocked(props.onOpenFolder).mock.invocationCallOrder[0]!
    );
  });

  it("requires the exact vault name before deleting, then closes only the confirm", async () => {
    const props = await renderDialog();
    await click(rowNamed("Recipes").querySelector('button[aria-label="Delete Recipes…"]'));

    const confirm = topDialog()!;
    expect(confirm.textContent).toContain("Delete “Recipes”?");
    const submit = confirm.querySelector<HTMLButtonElement>("button[type='submit']")!;
    expect(submit.disabled).toBe(true);

    await typeInto(confirm.querySelector("input")!, "Recip");
    expect(submit.disabled).toBe(true);
    await typeInto(confirm.querySelector("input")!, "Recipes");
    expect(submit.disabled).toBe(false);
    await click(submit);

    expect(props.onDeleteWorkspace).toHaveBeenCalledWith(
      expect.objectContaining({ rootPath: "/vaults/Recipes" })
    );
    await act(async () => undefined);
    // Success closed the confirm; the manager (now the only dialog) stays.
    expect(dialogs()).toHaveLength(1);
    expect(topDialog()?.textContent).toContain("Workspaces");
  });

  it("keeps the confirm open with an inline error when deletion fails", async () => {
    const props = await renderDialog();
    await click(rowNamed("Recipes").querySelector('button[aria-label="Delete Recipes…"]'));
    const confirm = topDialog()!;
    await typeInto(confirm.querySelector("input")!, "Recipes");

    vi.mocked(props.onDeleteWorkspace).mockResolvedValueOnce(false);
    await act(async () => {
      // Re-render with the failure surfaced to the confirm.
      root?.render(
        <WorkspaceManagerDialog {...props} error="Vault is busy" />
      );
    });
    await click(topDialog()!.querySelector("button[type='submit']"));
    await act(async () => undefined);

    expect(dialogs()).toHaveLength(2);
    expect(topDialog()?.querySelector('[role="alert"]')?.textContent).toBe("Vault is busy");
  });

  it("Escape closes only the delete confirm, leaving the manager open", async () => {
    await renderDialog();
    await click(rowNamed("Recipes").querySelector('button[aria-label="Delete Recipes…"]'));
    expect(dialogs()).toHaveLength(2);

    await act(async () => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
    });
    expect(dialogs()).toHaveLength(1);
    expect(topDialog()?.textContent).toContain("Workspaces");
  });

  it("shows a forget failure in the manager body, not hidden behind the list", async () => {
    await renderDialog({ error: "Could not forget workspace" });
    const alert = topDialog()?.querySelector('[role="alert"]');
    expect(alert?.textContent).toBe("Could not forget workspace");
  });

  it("clears the error when the delete confirm opens and when it is cancelled", async () => {
    const props = await renderDialog({ error: "stale" });
    await click(rowNamed("Recipes").querySelector('button[aria-label="Delete Recipes…"]'));
    expect(props.onClearError).toHaveBeenCalledOnce();
    // While the confirm is up, the manager's own alert is hidden.
    expect(dialogs()).toHaveLength(2);
    await click(
      [...topDialog()!.querySelectorAll("button")].find((b) => b.textContent === "Cancel")
    );
    expect(props.onClearError).toHaveBeenCalledTimes(2);
    expect(dialogs()).toHaveLength(1);
  });

  it("submits a delete only once while the native call is in flight", async () => {
    let release!: () => void;
    const onDeleteWorkspace = vi.fn(
      () => new Promise<boolean>((resolve) => { release = () => resolve(true); })
    );
    await renderDialog({ onDeleteWorkspace });
    await click(rowNamed("Recipes").querySelector('button[aria-label="Delete Recipes…"]'));
    const confirm = topDialog()!;
    await typeInto(confirm.querySelector("input")!, "Recipes");

    const submit = confirm.querySelector<HTMLButtonElement>("button[type='submit']")!;
    await click(submit);
    // In flight: the submit button is disabled and dismissal is blocked.
    expect(topDialog()?.querySelector<HTMLButtonElement>("button[type='submit']")?.disabled).toBe(true);
    await click(submit);
    expect(onDeleteWorkspace).toHaveBeenCalledOnce();

    await act(async () => release());
    await act(async () => undefined);
    expect(dialogs()).toHaveLength(1);
  });
});
