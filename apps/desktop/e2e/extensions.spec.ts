import { expect, test } from "@playwright/test";

/**
 * Covers the extension platform end to end: manifest-declared contributions
 * appear before any extension code runs, and touching one activates it.
 */

test("lists a built-in extension that has not started yet", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Extensions", exact: true }).click();

  const list = page.getByRole("list", { name: "Installed extensions" });
  await expect(list).toContainText("Note Stats");
  await expect(list).toContainText("Not started");
});

test("activates the extension when its panel is opened", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Extensions", exact: true }).click();
  await expect(page.getByRole("list", { name: "Installed extensions" })).toContainText("Not started");

  // The panel is contributed by the manifest, so it exists before activation.
  await page.getByRole("button", { name: "Note Stats", exact: true }).click();
  await expect(page.getByText("Open a Markdown note to see its statistics.")).toBeVisible();

  // The Extensions panel stays open throughout: it subscribes to status
  // changes, so it must flip to Active without being re-opened.
  await expect(page.getByRole("list", { name: "Installed extensions" })).toContainText("Active");
});

/**
 * Drives the local-directory loader end to end against a faked native bridge.
 *
 * The extension source is real: it is imported as an ES module from a blob url
 * and registers a command through the same scoped API a built-in uses.
 */
const EXTENSION_SOURCE = `
export function activate(context) {
  context.commands.register({
    id: "greet",
    title: "Greet from disk",
    availability: "available",
    handler: () => {
      document.title = "greeted";
    }
  });
}
`;

const MANIFEST = {
  id: "hello-disk",
  name: "Hello Disk",
  version: "1.0.0",
  apiVersion: "^1.0.0",
  engines: { platform: ["desktop"] },
  activationEvents: ["onCommand:greet"],
  capabilities: [],
  contributes: { commands: [{ id: "greet", title: "Greet from disk" }], panels: [] }
};

async function fakeExtensionDirectory(page: import("@playwright/test").Page, files: Record<string, string>) {
  await page.addInitScript(
    ({ files }) => {
      const appWindow = window as Window & {
        isTauri?: boolean;
        __TAURI_INTERNALS__?: { invoke: (command: string, args: Record<string, unknown>) => Promise<unknown> };
      };
      appWindow.isTauri = true;
      appWindow.__TAURI_INTERNALS__ = {
        async invoke(command, args) {
          if (command === "plugin:dialog|open") return "/ext/hello-disk";
          if (command === "read_extension_file") {
            const contents = files[String(args.relativePath)];
            if (contents === undefined) throw new Error(`missing ${String(args.relativePath)}`);
            return contents;
          }
          if (command === "read_app_settings") return null;
          if (command === "window_workspace_root") return null;
          return null;
        }
      };
      // The loader asks for confirmation before running trusted local code.
      window.confirm = () => true;
    },
    { files }
  );
}

test("loads, runs, reloads, and removes an extension from a local directory", async ({ page }) => {
  await fakeExtensionDirectory(page, {
    "extension.json": JSON.stringify(MANIFEST),
    "extension.js": EXTENSION_SOURCE
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Extensions", exact: true }).click();

  await page.getByRole("button", { name: "Add from folder…" }).click();

  const list = page.getByRole("list", { name: "Installed extensions" });
  await expect(list).toContainText("Hello Disk");
  await expect(list).toContainText("/ext/hello-disk");
  await expect(list).toContainText("Not started");

  // The command was stubbed from the manifest, so it is in the palette before
  // any extension code has run — and the palette had already rendered once.
  await page.keyboard.press("Control+p");
  await expect(page.getByRole("dialog", { name: "Command palette" })).toBeVisible();
  await page.getByRole("combobox", { name: "Search commands" }).fill("Greet from disk");
  await page.keyboard.press("Enter");

  await expect(page).toHaveTitle("greeted");
  await expect(list).toContainText("Active");

  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "Command palette" })).not.toBeVisible();

  await page.getByRole("button", { name: "Reload Hello Disk" }).click();
  await expect(list).toContainText("Not started");

  await page.getByRole("button", { name: "Remove Hello Disk" }).click();
  await expect(list).not.toContainText("Hello Disk");
});

test("restores stored extension directories at startup and reports one that fails", async ({ page }) => {
  await page.addInitScript(
    ({ files }) => {
      const appWindow = window as Window & {
        isTauri?: boolean;
        __TAURI_INTERNALS__?: { invoke: (command: string, args: Record<string, unknown>) => Promise<unknown> };
      };
      appWindow.isTauri = true;
      appWindow.__TAURI_INTERNALS__ = {
        async invoke(command, args) {
          if (command === "read_extension_file") {
            if (String(args.directory) !== "/ext/hello-disk") {
              throw new Error(`missing directory ${String(args.directory)}`);
            }
            const contents = files[String(args.relativePath)];
            if (contents === undefined) throw new Error(`missing ${String(args.relativePath)}`);
            return contents;
          }
          if (command === "read_app_settings") {
            return JSON.stringify({
              desktopState: {
                version: 3,
                developmentExtensionDirectories: ["/ext/hello-disk", "/ext/vanished"]
              }
            });
          }
          if (command === "window_workspace_root") return null;
          return null;
        }
      };
    },
    {
      files: {
        "extension.json": JSON.stringify(MANIFEST),
        "extension.js": EXTENSION_SOURCE
      }
    }
  );

  await page.goto("/");
  await page.getByRole("button", { name: "Extensions", exact: true }).click();

  // The stored directory loaded again with no user action.
  const list = page.getByRole("list", { name: "Installed extensions" });
  await expect(list).toContainText("Hello Disk");
  await expect(list).toContainText("/ext/hello-disk");

  // The vanished directory stays reported instead of silently disappearing.
  await expect(page.getByRole("list", { name: "Extension load errors" })).toContainText(
    "/ext/vanished"
  );
});

test("reports a broken extension directory without registering anything", async ({ page }) => {
  await fakeExtensionDirectory(page, { "extension.json": "{ not json" });
  await page.goto("/");
  await page.getByRole("button", { name: "Extensions", exact: true }).click();

  await page.getByRole("button", { name: "Add from folder…" }).click();

  await expect(page.getByRole("list", { name: "Extension load errors" })).toContainText(
    "not valid JSON"
  );
  await expect(page.getByRole("list", { name: "Installed extensions" })).not.toContainText(
    "Hello Disk"
  );
});

/**
 * The workspace API is the point of the extension platform: without it a
 * command can only toggle chrome. This drives the real path — a disk-loaded
 * module creates a note through the scoped API and opens it in an editor tab.
 */
const NOTES_EXTENSION_SOURCE = `
export function activate(context) {
  context.commands.register({
    id: "capture",
    title: "Capture note",
    availability: "available",
    handler: async () => {
      await context.workspace.createNote("captured.md", "# Captured\\n");
      await context.workspace.openNote("captured.md");
    }
  });
}
`;

const NOTES_MANIFEST = {
  id: "capture-notes",
  name: "Capture Notes",
  version: "1.0.0",
  apiVersion: "^1.0.0",
  engines: { platform: ["desktop"] },
  activationEvents: ["onCommand:capture"],
  capabilities: [],
  contributes: { commands: [{ id: "capture", title: "Capture note" }], panels: [] }
};

test("an extension creates a note and opens it through the workspace API", async ({ page }) => {
  const created: string[] = [];
  await page.exposeFunction("recordCreate", (path: string) => created.push(path));

  await page.addInitScript(
    ({ files }) => {
      const appWindow = window as Window & {
        isTauri?: boolean;
        recordCreate?: (path: string) => void;
        __TAURI_INTERNALS__?: { invoke: (command: string, args: Record<string, unknown>) => Promise<unknown> };
      };
      appWindow.isTauri = true;
      const notes = new Map<string, string>();
      appWindow.__TAURI_INTERNALS__ = {
        async invoke(command, args) {
          if (command === "plugin:dialog|open") {
            return args.title === "Open workspace" ? "/vault" : "/ext/capture-notes";
          }
          if (command === "read_extension_file") {
            const contents = files[String(args.relativePath)];
            if (contents === undefined) throw new Error(`missing ${String(args.relativePath)}`);
            return contents;
          }
          if (command === "open_workspace") {
            return { workspace: { root_path: String(args.rootPath), name: "vault" }, files: [] };
          }
          if (command === "list_workspace_entries") return [];
          if (command === "create_markdown_file") {
            const path = String(args.relativePath);
            notes.set(path, String(args.contents ?? ""));
            appWindow.recordCreate?.(path);
            return { relative_path: path, name: path, byte_size: 0, updated_at: null };
          }
          if (command === "read_markdown_file") {
            return { relative_path: String(args.relativePath), contents: notes.get(String(args.relativePath)) ?? "" };
          }
          if (command === "read_app_settings") return null;
          // The window reports its workspace root on load, so the shell has one
          // open before the extension runs.
          if (command === "window_workspace_root") return "/vault";
          return null;
        }
      };
      window.confirm = () => true;
    },
    {
      files: {
        "extension.json": JSON.stringify(NOTES_MANIFEST),
        "extension.js": NOTES_EXTENSION_SOURCE
      }
    }
  );

  await page.goto("/");
  await page.getByRole("button", { name: "Extensions", exact: true }).click();
  await page.getByRole("button", { name: "Add from folder…" }).click();
  await expect(page.getByRole("list", { name: "Installed extensions" })).toContainText("Capture Notes");

  await page.keyboard.press("Control+p");
  await page.getByRole("combobox", { name: "Search commands" }).fill("Capture note");
  await page.keyboard.press("Enter");

  // The note was written through the native bridge and opened as an editor tab.
  await expect.poll(() => created).toContain("captured.md");
  await expect(page.getByRole("navigation", { name: "Open tabs" })).toContainText("captured.md");
});
