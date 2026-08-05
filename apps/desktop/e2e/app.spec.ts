import { expect, test } from "@playwright/test";

test("desktop workspace shell boots in the browser harness", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("main", { name: "ThinkBrain desktop workspace" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Open tabs" })).toBeVisible();
  await expect(page.getByRole("complementary", { name: "Explorer panel" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Choose workspace" })).toBeVisible();
  await expect(page.getByText(/Welcome to ThinkBrain/)).toBeVisible();
});

test("activity bar toggles between the explorer and search panels", async ({ page }) => {
  await page.goto("/");

  await page.getByRole("button", { name: "Search" }).click();

  await expect(page.getByRole("complementary", { name: "Search panel" })).toBeVisible();
  await expect(page.getByText("Open a workspace to search its notes.")).toBeVisible();

  await page.getByRole("button", { name: "Explorer" }).click();
  await expect(page.getByRole("complementary", { name: "Explorer panel" })).toBeVisible();
  await expect(page.getByText("ThinkBrain will show the current folder hierarchy without changing any files.")).toBeVisible();

  await page.getByRole("button", { name: "Explorer" }).click();
  await expect(page.getByRole("complementary", { name: "Explorer panel" })).not.toBeVisible();
  await page.getByRole("button", { name: "Explorer" }).click();
  await expect(page.getByRole("complementary", { name: "Explorer panel" })).toBeVisible();
});

test("opens a workspace in a new window and restores the last workspace on reload", async ({ page }) => {
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
        if (command === "window_workspace_root") return null;
        if (command === "open_workspace_window") return null;
        if (command === "read_app_settings") return sessionStorage.getItem(settingsKey);
        if (command === "write_app_settings") {
          sessionStorage.setItem(settingsKey, String(args.contents));
          return null;
        }
        // The host's `update_desktop_state` command returns the full serialized
        // settings document after merging the partial update into `desktopState`.
        // The mock mirrors that contract so `loadDesktopState` can read it back.
        if (command === "update_desktop_state") {
          const current = JSON.parse(sessionStorage.getItem(settingsKey) ?? "{}") as Record<string, unknown>;
          const previousDesktopState = (current.desktopState ?? {}) as Record<string, unknown>;
          const update = (args.update ?? {}) as Record<string, unknown>;
          const merged = {
            version: 3,
            lastWorkspacePath: update.lastWorkspacePath ?? previousDesktopState.lastWorkspacePath ?? null,
            recentWorkspacePaths: update.recentWorkspacePaths ?? previousDesktopState.recentWorkspacePaths ?? [],
            explorerOpen: update.explorerOpen ?? previousDesktopState.explorerOpen ?? true,
            leftPanelWidth: update.leftPanelWidth ?? previousDesktopState.leftPanelWidth ?? 288,
            rightPanelWidth: update.rightPanelWidth ?? previousDesktopState.rightPanelWidth ?? 320,
            bottomPanelOpen: update.bottomPanelOpen ?? previousDesktopState.bottomPanelOpen ?? false
          };
          const next = { ...current, desktopState: merged };
          const serialized = JSON.stringify(next);
          sessionStorage.setItem(settingsKey, serialized);
          return serialized;
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
  await page.getByRole("button", { name: "Choose workspace" }).click();
  await page.getByRole("menuitem", { name: "Add workspace" }).click();
  await expect(page.getByRole("heading", { name: "No workspace open" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Choose workspace" })).toHaveText("Choose workspace");
  await expect.poll(() => page.evaluate(() => sessionStorage.getItem("thinkbrain-e2e-app-settings"))).toContain("demo-vault");

  await page.reload();
  await expect(page.getByRole("heading", { name: "demo-vault" })).toBeVisible();
  await expect(page.getByRole("treeitem", { name: /Notes/ })).toBeVisible();
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
        if (command === "window_workspace_root") return "/workspace/demo-vault";
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
  const assistant = page.getByRole("button", { name: "Assistant", exact: true });
  await assistant.focus();
  await page.keyboard.press("Control+p");
  const dialog = page.getByRole("dialog", { name: "Command palette" });
  await expect(dialog).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(assistant).toBeFocused();

  await page.keyboard.press("Control+p");
  const query = page.getByRole("combobox", { name: "Search commands" });
  await query.fill("welcome");
  await page.keyboard.press("Enter");
  await expect(page.locator('[aria-label="Markdown editor"]')).toBeVisible();

  await page.keyboard.press("Control+p");
  await query.fill("new note");
  await page.keyboard.press("Enter");
  await expect(page.getByLabel("New file name")).toBeFocused();

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
        if (command === "window_workspace_root") return "/workspace/demo-vault";
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
        if (command === "create_workspace_file") {
          const documents = readDocuments();
          documents[String(args.relativePath)] = String(args.contents ?? "");
          writeDocuments(documents);
          return { relative_path: String(args.relativePath), name: String(args.relativePath).split("/").at(-1), parent_path: String(args.relativePath).split("/").slice(0, -1).join("/"), kind: "file", is_markdown: true, byte_size: 0, updated_at: null };
        }
        if (command === "create_workspace_folder") {
          return { relative_path: String(args.relativePath), name: String(args.relativePath).split("/").at(-1), parent_path: String(args.relativePath).split("/").slice(0, -1).join("/"), kind: "directory", is_markdown: false, byte_size: 0, updated_at: null };
        }
        if (command === "rename_workspace_entry") {
          const documents = readDocuments();
          const oldKey = String(args.relativePath);
          const newKey = String(args.newRelativePath);
          if (oldKey in documents) {
            documents[newKey] = documents[oldKey];
            delete documents[oldKey];
            writeDocuments(documents);
          }
          const isDir = !newKey.includes(".");
          return { relative_path: newKey, name: newKey.split("/").at(-1), parent_path: newKey.split("/").slice(0, -1).join("/"), kind: isDir ? "directory" : "file", is_markdown: !isDir, byte_size: 0, updated_at: null };
        }
        if (command === "delete_workspace_entry") {
          const target = String(args.relativePath);
          const documents = readDocuments();
          for (const key of Object.keys(documents)) {
            if (key === target || key.startsWith(`${target}/`)) delete documents[key];
          }
          writeDocuments(documents);
          return null;
        }
        throw new Error(`Unexpected native command: ${command}`);
      }
    };
  });

  await page.goto("/");
  // The explorer tree starts collapsed; expand the "Notes" folder before
  // opening the welcome note inside it.
  await page.getByRole("button", { name: "Expand Notes" }).click();
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

  // Create a new note via the command palette "New note" action, which opens
  // an inline create-file input at the workspace root. The name field rejects
  // path separators by design, so a flat name is used.
  await page.keyboard.press("Control+p");
  await page.getByRole("combobox", { name: "Search commands" }).fill("new note");
  await page.keyboard.press("Enter");
  const newFileInput = page.getByLabel("New file name");
  await expect(newFileInput).toBeFocused();
  await newFileInput.fill("new-note.md");
  await newFileInput.press("Enter");
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
        if (command === "window_workspace_root") return "/workspace/repository";
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
        if (command === "window_workspace_root") return "/workspace/new-repository";
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

  // The bottom panel is toggled via the Ctrl/Cmd+J shortcut (there is no
  // dedicated "Toggle bottom panel" button in the chrome — the status bar
  // toggle was removed in favor of the shortcut + command palette).
  await page.keyboard.press("Control+j");
  await expect(page.getByRole("region", { name: "Bottom panel" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "terminal" })).toBeVisible();
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

test("the explorer context menu creates, renames, and deletes entries", async ({ page }) => {
  await page.addInitScript(() => {
    const documentsKey = "thinkbrain-e2e-context-menu-documents";
    const foldersKey = "thinkbrain-e2e-context-menu-folders";
    const appWindow = window as Window & {
      isTauri?: boolean;
      __TAURI_INTERNALS__?: { invoke: (command: string, args: Record<string, unknown>) => Promise<unknown> };
    };
    const readDocuments = (): Record<string, string> => JSON.parse(sessionStorage.getItem(documentsKey) ?? "{}");
    const writeDocuments = (documents: Record<string, string>) => sessionStorage.setItem(documentsKey, JSON.stringify(documents));
    const readFolders = (): string[] => JSON.parse(sessionStorage.getItem(foldersKey) ?? "[]");
    const writeFolders = (folders: string[]) => sessionStorage.setItem(foldersKey, JSON.stringify(folders));
    const entryFor = (relativePath: string, kind: "file" | "directory", isMarkdown: boolean) => ({
      relative_path: relativePath,
      name: relativePath.split("/").at(-1),
      parent_path: relativePath.split("/").slice(0, -1).join("/"),
      kind,
      is_markdown: isMarkdown,
      byte_size: 0,
      updated_at: null
    });
    const entriesFor = (documents: Record<string, string>, folders: string[]): unknown[] => {
      const entries: unknown[] = [];
      const seen = new Set<string>();
      // Explicitly-created folders (may be empty).
      for (const folder of folders) {
        if (!seen.has(folder)) {
          seen.add(folder);
          entries.push(entryFor(folder, "directory", false));
        }
      }
      // Files and their implicit ancestor folders.
      for (const relativePath of Object.keys(documents)) {
        const segments = relativePath.split("/");
        for (let i = 1; i < segments.length; i += 1) {
          const folder = segments.slice(0, i).join("/");
          if (!seen.has(folder)) {
            seen.add(folder);
            entries.push(entryFor(folder, "directory", false));
          }
        }
        entries.push(entryFor(relativePath, "file", true));
      }
      return entries;
    };
    appWindow.isTauri = true;
    appWindow.__TAURI_INTERNALS__ = {
      async invoke(command, args) {
        if (command === "plugin:dialog|open") return "/workspace/demo-vault";
        if (command === "window_workspace_root") return "/workspace/demo-vault";
        if (command === "read_app_settings") return null;
        if (command === "write_app_settings") return null;
        if (command === "open_workspace") return { workspace: { root_path: String(args.rootPath), name: "demo-vault" }, files: [] };
        if (command === "list_workspace_entries") return entriesFor(readDocuments(), readFolders());
        if (command === "read_markdown_file") return { relative_path: String(args.relativePath), contents: readDocuments()[String(args.relativePath)] ?? "" };
        if (command === "write_markdown_file") {
          const documents = readDocuments();
          documents[String(args.relativePath)] = String(args.contents);
          writeDocuments(documents);
          return { relative_path: String(args.relativePath), file_name: String(args.relativePath).split("/").at(-1), parent_path: "Notes", byte_size: 0, updated_at: null };
        }
        if (command === "create_workspace_file") {
          const documents = readDocuments();
          documents[String(args.relativePath)] = String(args.contents ?? "");
          writeDocuments(documents);
          return entryFor(String(args.relativePath), "file", true);
        }
        if (command === "create_workspace_folder") {
          const folders = readFolders();
          const folder = String(args.relativePath);
          if (!folders.includes(folder)) {
            folders.push(folder);
            writeFolders(folders);
          }
          return entryFor(folder, "directory", false);
        }
        if (command === "rename_workspace_entry") {
          const oldKey = String(args.relativePath);
          const newKey = String(args.newRelativePath);
          const documents = readDocuments();
          if (oldKey in documents) {
            documents[newKey] = documents[oldKey];
            delete documents[oldKey];
            writeDocuments(documents);
          }
          const folders = readFolders();
          const folderIndex = folders.indexOf(oldKey);
          if (folderIndex >= 0) {
            folders[folderIndex] = newKey;
            writeFolders(folders);
          }
          const isDir = !newKey.includes(".");
          return entryFor(newKey, isDir ? "directory" : "file", !isDir);
        }
        if (command === "delete_workspace_entry") {
          const target = String(args.relativePath);
          const documents = readDocuments();
          for (const key of Object.keys(documents)) {
            if (key === target || key.startsWith(`${target}/`)) delete documents[key];
          }
          writeDocuments(documents);
          const folders = readFolders().filter((folder) => folder !== target && !folder.startsWith(`${target}/`));
          writeFolders(folders);
          return null;
        }
        throw new Error(`Unexpected native command: ${command}`);
      }
    };
  });

  await page.goto("/");
  await expect(page.getByText("This workspace is empty. Right-click to create a new file or folder.")).toBeVisible();

  // Right-click the background and create a new folder.
  const treeRegion = page.getByLabel("demo-vault explorer");
  await treeRegion.click({ button: "right" });
  await page.getByRole("menuitem", { name: "New folder" }).click();
  const folderInput = page.getByLabel("New folder name");
  await expect(folderInput).toBeFocused();
  await folderInput.fill("Notes");
  await folderInput.press("Enter");
  await expect(page.getByRole("treeitem", { name: /Notes/ })).toBeVisible();

  // Right-click the folder and create a file inside it.
  await page.getByRole("treeitem", { name: /Notes/ }).click({ button: "right" });
  await page.getByRole("menuitem", { name: "New file" }).click();
  const fileInput = page.getByLabel("New file name");
  await expect(fileInput).toBeFocused();
  await fileInput.fill("welcome.md");
  await fileInput.press("Enter");
  await expect(page.getByRole("button", { name: "Open welcome.md" })).toBeVisible();

  // Right-click the file and rename it.
  await page.getByRole("button", { name: "Open welcome.md" }).click({ button: "right" });
  await page.getByRole("menuitem", { name: "Rename" }).click();
  const renameInput = page.getByLabel("Rename welcome.md");
  await expect(renameInput).toBeFocused();
  await renameInput.fill("intro.md");
  await renameInput.press("Enter");
  await expect(page.getByRole("button", { name: "Open intro.md" })).toBeVisible();

  // Right-click the renamed file and delete it via the confirmation dialog.
  await page.getByRole("button", { name: "Open intro.md" }).click({ button: "right" });
  await page.getByRole("menuitem", { name: "Delete" }).click();
  await expect(page.getByRole("dialog", { name: "Confirm deletion" })).toBeVisible();
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(page.getByRole("button", { name: "Open intro.md" })).not.toBeVisible();
});
