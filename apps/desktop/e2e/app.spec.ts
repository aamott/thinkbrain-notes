import { expect, test } from "@playwright/test";

test("desktop workspace shell boots in the browser harness", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("main", { name: "ThinkBrain desktop workspace" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Open tabs" })).toBeVisible();
  await expect(page.getByRole("complementary", { name: "Explorer panel" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Open workspace" })).toBeVisible();
  await expect(page.getByText(/Welcome to ThinkBrain/)).toBeVisible();
});

test("activity bar toggles between the explorer and search panels", async ({ page }) => {
  await page.goto("/");

  await page.getByRole("button", { name: "Search" }).click();

  await expect(page.getByRole("complementary", { name: "Search panel" })).toBeVisible();
  await expect(page.getByText("This workspace surface is not connected yet.")).toBeVisible();

  await page.getByRole("button", { name: "Explorer" }).click();
  await expect(page.getByRole("complementary", { name: "Explorer panel" })).toBeVisible();
  await expect(page.getByText("ThinkBrain will show the current folder hierarchy without changing any files.")).toBeVisible();

  await page.getByRole("button", { name: "Explorer" }).click();
  await expect(page.getByRole("complementary", { name: "Explorer panel" })).not.toBeVisible();
  await page.getByRole("button", { name: "Explorer" }).click();
  await expect(page.getByRole("complementary", { name: "Explorer panel" })).toBeVisible();
});

test("opens a workspace and restores the Explorer visibility and last workspace", async ({ page }) => {
  await page.addInitScript(() => {
    const settingsKey = "thinkbrain-e2e-app-settings";
    const appWindow = window as Window & {
      isTauri?: boolean;
      __TAURI_INTERNALS__?: { invoke: (command: string, args: Record<string, unknown>) => Promise<unknown> };
    };
    appWindow.isTauri = true;
    appWindow.__TAURI_INTERNALS__ = {
      async invoke(command, args) {
        if (command === "plugin:dialog|open") return "/workspace/demo-vault";
        if (command === "read_app_settings") return sessionStorage.getItem(settingsKey);
        if (command === "write_app_settings") {
          sessionStorage.setItem(settingsKey, String(args.contents));
          return null;
        }
        if (command === "open_workspace") {
          return {
            workspace: { root_path: String(args.rootPath), name: "demo-vault" },
            files: []
          };
        }
        if (command === "list_workspace_entries") {
          return [
            { relative_path: "Notes", name: "Notes", parent_path: "", kind: "directory", is_markdown: false, byte_size: 0, updated_at: null },
            { relative_path: "Notes/welcome.md", name: "welcome.md", parent_path: "Notes", kind: "file", is_markdown: true, byte_size: 12, updated_at: null }
          ];
        }
        throw new Error(`Unexpected native command: ${command}`);
      }
    };
  });

  await page.goto("/");
  await page.getByRole("button", { name: "Open workspace" }).click();
  await expect(page.getByRole("heading", { name: "demo-vault" })).toBeVisible();
  await expect(page.getByRole("tree", { name: "demo-vault files" })).toBeVisible();
  await expect(page.getByText("welcome.md")).toBeVisible();

  await page.getByRole("button", { name: "Explorer", exact: true }).click();
  await expect(page.getByRole("complementary", { name: "Explorer panel" })).not.toBeVisible();

  await page.reload();
  await expect(page.getByRole("complementary", { name: "Explorer panel" })).not.toBeVisible();
  await page.getByRole("button", { name: "Explorer", exact: true }).click();
  await expect(page.getByRole("heading", { name: "demo-vault" })).toBeVisible();
  await expect(page.getByText("welcome.md")).toBeVisible();
});

test("command palette opens workspace files, runs commands, and restores focus", async ({ page }) => {
  await page.addInitScript(() => {
    const appWindow = window as Window & {
      isTauri?: boolean;
      __TAURI_INTERNALS__?: { invoke: (command: string, args: Record<string, unknown>) => Promise<unknown> };
    };
    appWindow.isTauri = true;
    appWindow.__TAURI_INTERNALS__ = {
      async invoke(command, args) {
        if (command === "plugin:dialog|open") return "/workspace/demo-vault";
        if (command === "read_app_settings") return null;
        if (command === "write_app_settings") return null;
        if (command === "open_workspace") return {
          workspace: { root_path: String(args.rootPath), name: "demo-vault" },
          files: [{ relative_path: "Notes/welcome.md", file_name: "welcome.md", parent_path: "Notes", byte_size: 9, updated_at: null }]
        };
        if (command === "list_workspace_entries") return [
          { relative_path: "Notes", name: "Notes", parent_path: "", kind: "directory", is_markdown: false, byte_size: 0, updated_at: null },
          { relative_path: "Notes/welcome.md", name: "welcome.md", parent_path: "Notes", kind: "file", is_markdown: true, byte_size: 9, updated_at: null }
        ];
        if (command === "read_markdown_file") return { relative_path: String(args.relativePath), contents: "# Welcome" };
        throw new Error(`Unexpected native command: ${command}`);
      }
    };
  });

  await page.goto("/");
  await page.getByRole("button", { name: "Open workspace" }).click();
  const assistant = page.getByRole("button", { name: "Assistant", exact: true });
  await assistant.focus();
  await page.keyboard.press("Control+p");
  const dialog = page.getByRole("dialog", { name: "Command palette" });
  await expect(dialog).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(assistant).toBeFocused();

  await page.keyboard.press("Control+p");
  const query = page.getByRole("textbox", { name: "Search commands" });
  await query.fill("welcome");
  await page.keyboard.press("Enter");
  await expect(page.locator('[aria-label="Markdown editor"]')).toBeVisible();

  await page.keyboard.press("Control+p");
  await query.fill("new note");
  await page.keyboard.press("Enter");
  await expect(page.getByLabel("New note")).toBeFocused();

  await page.keyboard.press("Control+p");
  await query.fill("graph");
  await page.keyboard.press("Enter");
  await expect(page.getByText("Graph is unavailable until link indexing is connected.")).toBeVisible();
});

test("opens, saves, protects, and creates Markdown notes through the fresh shell", async ({ page }) => {
  await page.addInitScript(() => {
    const documentsKey = "thinkbrain-e2e-markdown-documents";
    const appWindow = window as Window & {
      isTauri?: boolean;
      __TAURI_INTERNALS__?: { invoke: (command: string, args: Record<string, unknown>) => Promise<unknown> };
    };
    const readDocuments = (): Record<string, string> => JSON.parse(sessionStorage.getItem(documentsKey) ?? "{\"Notes/welcome.md\":\"# Welcome\"}");
    const writeDocuments = (documents: Record<string, string>) => sessionStorage.setItem(documentsKey, JSON.stringify(documents));
    appWindow.isTauri = true;
    appWindow.__TAURI_INTERNALS__ = {
      async invoke(command, args) {
        if (command === "plugin:dialog|open") return "/workspace/demo-vault";
        if (command === "read_app_settings") return null;
        if (command === "write_app_settings") return null;
        if (command === "open_workspace") return { workspace: { root_path: String(args.rootPath), name: "demo-vault" }, files: [] };
        if (command === "list_workspace_entries") return Object.keys(readDocuments()).flatMap((relativePath) => [
          { relative_path: "Notes", name: "Notes", parent_path: "", kind: "directory", is_markdown: false, byte_size: 0, updated_at: null },
          { relative_path: relativePath, name: relativePath.split("/").at(-1), parent_path: "Notes", kind: "file", is_markdown: true, byte_size: 0, updated_at: null }
        ]).filter((entry, index, entries) => entry.relative_path !== "Notes" || index === entries.findIndex((candidate) => candidate.relative_path === "Notes"));
        if (command === "read_markdown_file") {
          const relativePath = String(args.relativePath);
          return { relative_path: relativePath, contents: readDocuments()[relativePath] ?? "" };
        }
        if (command === "write_markdown_file") {
          const documents = readDocuments();
          documents[String(args.relativePath)] = String(args.contents);
          writeDocuments(documents);
          return { relative_path: String(args.relativePath), file_name: String(args.relativePath).split("/").at(-1), parent_path: "Notes", byte_size: String(args.contents).length, updated_at: null };
        }
        if (command === "create_markdown_file") {
          const documents = readDocuments();
          documents[String(args.relativePath)] = String(args.contents ?? "");
          writeDocuments(documents);
          return { relative_path: String(args.relativePath), file_name: String(args.relativePath).split("/").at(-1), parent_path: "Notes", byte_size: 0, updated_at: null };
        }
        throw new Error(`Unexpected native command: ${command}`);
      }
    };
  });

  await page.goto("/");
  await page.getByRole("button", { name: "Open workspace" }).click();
  await page.getByRole("button", { name: "Open welcome.md" }).click();
  const editor = page.locator('[aria-label="Markdown editor"]');
  await expect(editor).toBeVisible();
  await editor.click();
  await page.keyboard.press("Control+a");
  await page.keyboard.type("# Updated welcome");
  await expect(page.getByLabel("Unsaved changes")).toBeVisible();

  await page.getByRole("button", { name: "Close welcome.md" }).click();
  await expect(page.getByRole("dialog", { name: "Unsaved changes" })).toBeVisible();
  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(editor).toBeVisible();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByLabel("Unsaved changes")).not.toBeVisible();
  await expect.poll(() => page.evaluate(() => sessionStorage.getItem("thinkbrain-e2e-markdown-documents"))).toContain("# Updated welcome");

  await page.getByLabel("New note").fill("Notes/new-note.md");
  await page.getByRole("button", { name: "Create" }).click();
  await expect(page.getByRole("button", { name: "Close new-note.md" })).toBeVisible();
  await expect(editor).toBeVisible();
});

test("shell exposes labelled landmarks and keyboard-accessible controls", async ({ page }) => {
  await page.goto("/");

  await expect(page.locator("main > header")).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Open tabs" })).toBeVisible();
  await expect(page.getByRole("main", { name: "ThinkBrain desktop workspace" })).toBeVisible();
  await expect(page.locator("footer")).toBeVisible();

  const assistant = page.getByRole("button", { name: "Assistant", exact: true });
  await assistant.focus();
  await expect(assistant).toBeFocused();

  await page.keyboard.press("Control+p");
  await expect(page.getByRole("dialog", { name: "Command palette" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "Command palette" })).not.toBeVisible();
});

test("unavailable sections retain their owning panel", async ({ page }) => {
  await page.goto("/");

  await page.getByRole("button", { name: "Source control" }).click();

  await expect(page.getByRole("complementary", { name: "Source control panel" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Source control" })).toBeVisible();
  await expect(page.getByText("Open a workspace to view its Git repository information.")).toBeVisible();
});

test("source control reports the active workspace repository", async ({ page }) => {
  await page.addInitScript(() => {
    const appWindow = window as Window & {
      isTauri?: boolean;
      __TAURI_INTERNALS__?: { invoke: (command: string, args: Record<string, unknown>) => Promise<unknown> };
    };
    appWindow.isTauri = true;
    appWindow.__TAURI_INTERNALS__ = {
      async invoke(command, args) {
        if (command === "plugin:dialog|open") return "/workspace/repository";
        if (command === "read_app_settings") return null;
        if (command === "write_app_settings") return null;
        if (command === "open_workspace") return { workspace: { root_path: String(args.rootPath), name: "repository" }, files: [] };
        if (command === "list_workspace_entries") return [];
        if (command === "git_availability") return { available: true, version: "git version 2.50.0" };
        if (command === "detect_git_repository") return { is_repository: true, branch: "main" };
        if (command === "git_status") return [
          { path: "staged.md", index_status: "A", worktree_status: " " },
          { path: "changed.md", index_status: " ", worktree_status: "M" },
          { path: "draft.md", index_status: "?", worktree_status: "?" }
        ];
        throw new Error(`Unexpected native command: ${command}`);
      }
    };
  });

  await page.goto("/");
  await page.getByRole("button", { name: "Open workspace" }).click();
  await page.getByRole("button", { name: "Source control" }).click();
  await expect(page.getByText("Repository", { exact: true })).toBeVisible();
  await expect(page.getByText("main", { exact: true })).toBeVisible();
  await expect(page.getByRole("region", { name: "Staged files" })).toContainText("staged.md");
  await expect(page.getByRole("region", { name: "Changed files" })).toContainText("changed.md");
  await expect(page.getByRole("region", { name: "Untracked files" })).toContainText("draft.md");
});

test("source control initializes a workspace repository", async ({ page }) => {
  await page.addInitScript(() => {
    const appWindow = window as Window & {
      isTauri?: boolean;
      __TAURI_INTERNALS__?: { invoke: (command: string, args: Record<string, unknown>) => Promise<unknown> };
    };
    appWindow.isTauri = true;
    appWindow.__TAURI_INTERNALS__ = {
      async invoke(command, args) {
        if (command === "plugin:dialog|open") return "/workspace/new-repository";
        if (command === "read_app_settings") return null;
        if (command === "write_app_settings") return null;
        if (command === "open_workspace") return { workspace: { root_path: String(args.rootPath), name: "new-repository" }, files: [] };
        if (command === "list_workspace_entries") return [];
        if (command === "git_availability") return { available: true, version: "git version 2.50.0" };
        if (command === "detect_git_repository") return { is_repository: false, branch: null };
        if (command === "initialize_git_repository") return { is_repository: true, branch: null };
        if (command === "git_status") return [];
        throw new Error(`Unexpected native command: ${command}`);
      }
    };
  });

  await page.goto("/");
  await page.getByRole("button", { name: "Open workspace" }).click();
  await page.getByRole("button", { name: "Source control" }).click();
  await page.getByRole("button", { name: "Initialize repository" }).click();
  await expect(page.getByText("Repository initialized.")).toBeVisible();
  await expect(page.getByText("Detached HEAD", { exact: true })).toBeVisible();
});

test("assistant and bottom panel toggles preserve the editor", async ({ page }) => {
  await page.goto("/");

  await page.getByRole("button", { name: "Assistant", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Assistant" })).toBeVisible();
  await page.getByRole("button", { name: "Explorer", exact: true }).click();
  await expect(page.getByRole("complementary", { name: "Explorer panel" })).not.toBeVisible();
  await expect(page.getByRole("heading", { name: "Assistant" })).toBeVisible();
  await page.getByRole("button", { name: "Assistant", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Assistant" })).not.toBeVisible();

  await page.getByRole("button", { name: "Toggle bottom panel" }).click();
  await expect(page.getByRole("region", { name: "Bottom panel" })).toBeVisible();
  await expect(page.getByText("terminal panel")).toBeVisible();
  await page.getByRole("button", { name: "Close bottom panel" }).click();
  await expect(page.getByRole("region", { name: "Bottom panel" })).not.toBeVisible();
  await expect(page.getByRole("main", { name: "ThinkBrain desktop workspace" })).toBeVisible();
});

test("the editor remains usable without horizontal page overflow on a narrow screen", async ({ page }) => {
  await page.setViewportSize({ width: 640, height: 480 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");

  await expect(page.getByRole("main")).toBeVisible();
  await expect(page.getByRole("button", { name: "Explorer", exact: true })).toHaveCSS("transition-duration", "0s");

  const hasHorizontalOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth
  );
  expect(hasHorizontalOverflow).toBe(false);
});
