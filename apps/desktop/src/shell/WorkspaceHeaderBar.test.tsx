// @vitest-environment happy-dom
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createEditorTab, type DesktopTab } from "../tabs/tabModel";
import { WorkspaceHeaderBar, type WorkspaceHeaderBarProps } from "./WorkspaceHeaderBar";

vi.mock("../workspace/workspaceSettings", () => ({
  isWorkspaceGitLinked: vi.fn((path: string) => Promise.resolve(path.includes("git-linked")))
}));

let container: HTMLDivElement | null = null;
let root: Root | null = null;

afterEach(async () => {
  if (root) {
    await act(async () => root?.unmount());
    root = null;
  }
  container?.remove();
  container = null;
});

async function mount(props: WorkspaceHeaderBarProps): Promise<HTMLElement> {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => {
    root?.render(<WorkspaceHeaderBar {...props} />);
  });
  return container;
}

const editorTab = (relativePath = "notes/ideas.md"): DesktopTab =>
  createEditorTab({ rootPath: "/vault", relativePath });

describe("WorkspaceHeaderBar", () => {
  it("renders folder path breadcrumb segments and workspace name", async () => {
    const emptyHost = await mount({});
    expect(emptyHost.textContent).toBe("Workspace");

    const nestedTab = editorTab("work/projects/alpha/plan.md");
    const nestedHost = await mount({ workspaceName: "Vault", activeTab: nestedTab });
    expect(nestedHost.textContent).toContain("Vault");
    expect(nestedHost.textContent).toContain("work");
    expect(nestedHost.textContent).toContain("projects");
    expect(nestedHost.textContent).toContain("alpha");
    expect(nestedHost.textContent).toContain("plan.md");
    expect(nestedHost.textContent).toContain("›");

    const nonFileTab: DesktopTab = { id: "settings", title: "Settings", kind: "settings" };
    const nonFileHost = await mount({ workspaceName: "Vault", activeTab: nonFileTab });
    expect(nonFileHost.textContent).toContain("Vault");
    expect(nonFileHost.textContent).toContain("Settings");
    expect(nonFileHost.querySelector("button")).toBeNull();
  });

  it("handles Save button states, tooltips, and click callbacks", async () => {
    const tab = editorTab("notes.md");
    const onSave = vi.fn();

    // Clean / unmodified note: button is disabled and grayed out with shortcut tooltip
    const cleanHost = await mount({ activeTab: tab, isDirty: false });
    const cleanBtn = cleanHost.querySelector<HTMLButtonElement>("button");
    expect(cleanBtn?.disabled).toBe(true);
    expect(cleanBtn?.className).toContain("opacity-50");
    expect(cleanBtn?.getAttribute("title")).toMatch(/^Save \((Ctrl\+S|⌘S)\)$/);

    // Modified note: button is enabled and calls onSave on click
    const dirtyHost = await mount({ activeTab: tab, isDirty: true, onSave });
    const dirtyBtn = dirtyHost.querySelector<HTMLButtonElement>("button");
    expect(dirtyBtn?.disabled).toBe(false);
    expect(dirtyBtn?.className).toContain("bg-primary");
    dirtyBtn?.click();
    expect(onSave).toHaveBeenCalledOnce();

    // In-flight saving note: button shows "Saving…" and is disabled
    const savingHost = await mount({ activeTab: tab, isDirty: true, isSaving: true });
    const savingBtn = savingHost.querySelector<HTMLButtonElement>("button");
    expect(savingBtn?.textContent).toBe("Saving…");
    expect(savingBtn?.disabled).toBe(true);
  });

  it("renders custom children actions alongside the header", async () => {
    const host = await mount({
      activeTab: editorTab(),
      children: <button type="button" data-testid="extra">Extra</button>
    });
    expect(host.querySelector('[data-testid="extra"]')).not.toBeNull();
  });

  it("renders folder icon for regular workspaces and git folder icon for git-linked workspaces", async () => {
    const plainHost = await mount({ workspaceName: "Vault", rootPath: "/vault" });
    expect(plainHost.querySelector("svg")).not.toBeNull();

    const gitHost = await mount({ workspaceName: "Git Vault", rootPath: "/vault-git-linked" });
    await act(async () => {});
    expect(gitHost.querySelector("svg")).not.toBeNull();
  });
});
