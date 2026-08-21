import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test, type Page } from "@playwright/test";

/**
 * Covers the extension platform end to end: manifest-declared contributions
 * appear before any extension code runs, and touching one activates it.
 */

/** Command-palette shortcut: Cmd on macOS, Ctrl everywhere else. */
const OPEN_PALETTE = process.platform === "darwin" ? "Meta+p" : "Control+p";

/** Sync status returned by every fake bridge: sync is off, nothing pending. */
const SYNC_STATUS_OFF = {
  state: "off",
  lastRecordedAt: null,
  waiting: 0,
  attention: 0,
  stuck: [],
  problem: null,
  phase: null,
  health: "unknown",
  lastCheckedAt: null,
  alongsideOwnGit: false,
  maintenanceProblem: null
} as const;

type InvokeArgs = Record<string, unknown>;
/** A per-command stub. Runs in Node: it may close over local state directly. */
type InvokeStub = (args: InvokeArgs) => unknown;

interface FakeBridgeOptions {
  files: Record<string, string>;
  /** Per-command stubs. Every command the app invokes must be stubbed or it throws. */
  stubs?: Record<string, InvokeStub>;
  /**
   * Override `read_extension_file`. Defaults to reading `files` by `relativePath`
   * and throwing if the file is missing.
   */
  readExtensionFile?: (args: InvokeArgs) => unknown;
}

/**
 * Installs a fake `__TAURI_INTERNALS__` bridge on the page.
 *
 * The dispatcher runs in Node via `exposeFunction`, so stubs close over local
 * arrays/maps directly — no `window.recordX` plumbing needed for invoke side
 * effects. Unknown commands throw `unstubbed invoke: <command>` so a missing
 * stub surfaces immediately instead of silently returning null.
 */
async function installFakeTauriBridge(page: Page, options: FakeBridgeOptions) {
  const files = options.files;
  const stubs = options.stubs ?? {};
  const readExtensionFile = options.readExtensionFile;

  await page.exposeFunction("__e2eInvoke", async (command: string, args: InvokeArgs): Promise<unknown> => {
    if (command === "read_extension_file") {
      if (readExtensionFile) return readExtensionFile(args);
      const contents = files[String(args.relativePath)];
      if (contents === undefined) throw new Error(`missing ${String(args.relativePath)}`);
      return contents;
    }
    const stub = stubs[command];
    if (stub === undefined) throw new Error(`unstubbed invoke: ${command}`);
    return stub(args);
  });

  await page.addInitScript(() => {
    const appWindow = window as Window & {
      isTauri?: boolean;
      __TAURI_INTERNALS__?: { invoke: (command: string, args: InvokeArgs) => Promise<unknown> };
    };
    appWindow.isTauri = true;
    appWindow.__TAURI_INTERNALS__ = {
      async invoke(command, args) {
        return (window as unknown as { __e2eInvoke: (c: string, a: InvokeArgs) => Promise<unknown> }).__e2eInvoke(
          command,
          args
        );
      }
    };
    // The loader asks for confirmation before running trusted local code.
    window.confirm = () => true;
  });
}

/** Stubs shared by every test that loads a single extension from a folder picker. */
const SINGLE_EXTENSION_STUBS: Record<string, InvokeStub> = {
  "plugin:dialog|open": () => "/ext/hello-disk",
  read_app_settings: () => null,
  window_workspace_root: () => null
};

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

test("loads, runs, reloads, and removes an extension from a local directory", async ({ page }) => {
  await installFakeTauriBridge(page, {
    files: { "extension.json": JSON.stringify(MANIFEST), "extension.js": EXTENSION_SOURCE },
    stubs: SINGLE_EXTENSION_STUBS
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
  await page.keyboard.press(OPEN_PALETTE);
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
  const files: Record<string, string> = {
    "extension.json": JSON.stringify(MANIFEST),
    "extension.js": EXTENSION_SOURCE
  };
  await installFakeTauriBridge(page, {
    files,
    stubs: {
      read_app_settings: () =>
        JSON.stringify({
          desktopState: {
            version: 3,
            developmentExtensionDirectories: ["/ext/hello-disk", "/ext/vanished"]
          }
        }),
      window_workspace_root: () => null
    },
    // The restored-directory loader passes `directory`; only the known one has files.
    readExtensionFile: (args) => {
      if (String(args.directory) !== "/ext/hello-disk") {
        throw new Error(`missing directory ${String(args.directory)}`);
      }
      const contents = files[String(args.relativePath)];
      if (contents === undefined) throw new Error(`missing ${String(args.relativePath)}`);
      return contents;
    }
  });

  await page.goto("/");
  await page.getByRole("button", { name: "Extensions", exact: true }).click();

  // The stored directory loaded again with no user action.
  const list = page.getByRole("list", { name: "Installed extensions" });
  await expect(list).toContainText("Hello Disk");
  await expect(list).toContainText("/ext/hello-disk");

  // The vanished directory stays reported instead of silently disappearing.
  await expect(page.getByRole("list", { name: "Extension load errors" })).toContainText("/ext/vanished");
});

test("reports a broken extension directory without registering anything", async ({ page }) => {
  await installFakeTauriBridge(page, {
    files: { "extension.json": "{ not json" },
    stubs: SINGLE_EXTENSION_STUBS
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Extensions", exact: true }).click();

  await page.getByRole("button", { name: "Add from folder…" }).click();

  await expect(page.getByRole("list", { name: "Extension load errors" })).toContainText("not valid JSON");
  await expect(page.getByRole("list", { name: "Installed extensions" })).not.toContainText("Hello Disk");
});

/**
 * The workspace API is the point of the extension platform: without it a
 * command can only toggle chrome. This drives the real path — a disk-loaded
 * module creates a note through the scoped API and opens it in an editor tab.
 */
const NOTES_EXTENSION_SOURCE = `
export function activate(context) {
  context.events.on("note.created", (event) => {
    window.recordEvent?.("created:" + event.relativePath);
  });
  context.events.on("note.opened", (event) => {
    window.recordEvent?.("opened:" + event.relativePath);
  });
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

/**
 * A panel contributed from disk. The extension never imports React: it is
 * handed an element and owns everything inside it, which is what lets a
 * pre-bundled module contribute UI at all.
 */
const PANEL_EXTENSION_SOURCE = `
export function activate(context) {
  context.panels.register({
    id: "board",
    label: "Board",
    icon: "▦",
    side: "left",
    mount: (element, mountContext) => {
      const region = element.ownerDocument.createElement("section");
      region.setAttribute("aria-label", "Board contents");
      const status = element.ownerDocument.createElement("p");
      const render = (state) => {
        status.textContent = state.documentContents === null
          ? "No note open"
          : "Characters: " + state.documentContents.length;
      };
      render(mountContext.state);
      mountContext.onDidChange(render);
      region.append(status);
      element.append(region);
    },
    // Header buttons are data, so a panel that renders its own DOM still gets
    // them from the shell's chrome.
    actions: [
      {
        id: "clear",
        label: "Clear board",
        icon: "⌫",
        run: () => {
          document.title = "cleared";
        }
      }
    ]
  });
}
`;

const PANEL_MANIFEST = {
  id: "board-ext",
  name: "Board",
  version: "1.0.0",
  apiVersion: "^1.0.0",
  engines: { platform: ["desktop"] },
  activationEvents: ["onView:board"],
  capabilities: [],
  contributes: {
    commands: [],
    panels: [{ id: "board", label: "Board", icon: "▦", side: "left" }]
  }
};

test("an extension loaded from disk gets its own activity-bar space and mounts its own DOM", async ({
  page
}) => {
  await installFakeTauriBridge(page, {
    files: { "extension.json": JSON.stringify(PANEL_MANIFEST), "extension.js": PANEL_EXTENSION_SOURCE },
    stubs: SINGLE_EXTENSION_STUBS
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Extensions", exact: true }).click();
  await page.getByRole("button", { name: "Add from folder…" }).click();
  await expect(page.getByRole("list", { name: "Installed extensions" })).toContainText("Board");

  // The panel is its own entry in the activity bar — not a child of the
  // Extensions panel — and exists from the manifest, before any code runs.
  const activityBar = page.getByRole("complementary", { name: "Workspace sections" });
  const boardButton = activityBar.getByRole("button", { name: "Board", exact: true });
  await expect(boardButton).toBeVisible();
  await expect(page.getByRole("list", { name: "Installed extensions" })).toContainText("Not started");

  // Opening it activates the extension, which mounts its own DOM in place of
  // the placeholder.
  await boardButton.click();
  const boardContents = page.getByRole("region", { name: "Board contents" });
  await expect(boardContents).toBeVisible();
  await expect(boardContents).toHaveText("No note open");

  // The panel's own header button, contributed alongside the panel.
  await page.getByRole("button", { name: "Clear board" }).click();
  await expect(page).toHaveTitle("cleared");

  // Opening the panel is what activated it: both are left-side panels, so the
  // Extensions list has to be reopened to see the new status.
  await activityBar.getByRole("button", { name: "Extensions", exact: true }).click();
  await expect(page.getByRole("list", { name: "Installed extensions" })).toContainText("Active");
});

/**
 * The shipped example extension is real documentation: this test loads the
 * actual files from examples/extensions/hello-notes so the sample a user
 * follows can never drift from the platform it demonstrates.
 */
test("the hello-notes example extension loads from its shipped files and captures a note", async ({ page }) => {
  const exampleDirectory = path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    "..",
    "..",
    "..",
    "examples",
    "extensions",
    "hello-notes"
  );
  const files = {
    "extension.json": readFileSync(path.join(exampleDirectory, "extension.json"), "utf8"),
    "extension.js": readFileSync(path.join(exampleDirectory, "extension.js"), "utf8")
  };

  const created: string[] = [];
  const notes = new Map<string, string>();
  await installFakeTauriBridge(page, {
    files,
    stubs: {
      "plugin:dialog|open": () => "/ext/hello-notes",
      open_workspace: (args) => ({ workspace: { root_path: String(args.rootPath), name: "vault" }, files: [] }),
      list_workspace_entries: () => [],
      create_markdown_file: (args) => {
        const relativePath = String(args.relativePath);
        notes.set(relativePath, String(args.contents ?? ""));
        created.push(relativePath);
        return { relative_path: relativePath, name: relativePath, byte_size: 0, updated_at: null };
      },
      read_markdown_file: (args) => ({
        relative_path: String(args.relativePath),
        contents: notes.get(String(args.relativePath)) ?? ""
      }),
      read_app_settings: () => null,
      window_workspace_root: () => "/vault",
      sync_status: () => SYNC_STATUS_OFF
    }
  });

  await page.goto("/");
  const activityBar = page.getByRole("complementary", { name: "Workspace sections" });
  await activityBar.getByRole("button", { name: "Extensions", exact: true }).click();
  await page.getByRole("button", { name: "Add from folder…" }).click();
  await expect(page.getByRole("list", { name: "Installed extensions" })).toContainText("Hello Notes");

  // The example's panel takes its own place in the activity bar.
  await activityBar.getByRole("button", { name: "Capture", exact: true }).click();
  await expect(page.getByText("Capturing into /vault")).toBeVisible();

  // Its header action captures a note, and its own note.created subscription
  // lists the result.
  await page.getByRole("button", { name: "New capture" }).click();
  await expect.poll(() => created).toHaveLength(1);
  expect(created[0]).toMatch(/^captures\/capture-.+\.md$/);
  const capturePanel = page.getByRole("complementary", { name: "Capture panel" });
  await expect(capturePanel.getByRole("listitem")).toHaveText(created[0]!);

  // The same capture is reachable from the command palette.
  await page.keyboard.press(OPEN_PALETTE);
  await page.getByRole("combobox", { name: "Search commands" }).fill("Capture a note");
  await page.keyboard.press("Enter");

  await expect.poll(() => created).toHaveLength(2);
  // The tab title is the capture's basename: captures/capture-<stamp>.md -> capture-<stamp>.md
  await expect(page.getByRole("navigation", { name: "Open tabs" })).toContainText(/capture-.+\.md/);
});

test("an extension creates a note and opens it through the workspace API", async ({ page }) => {
  const created: string[] = [];
  const events: string[] = [];
  // The extension source calls `window.recordEvent` from inside the page, so it
  // still needs an exposed function (invoke stubs run in Node and close over
  // `created` directly, so `recordCreate` is not needed).
  await page.exposeFunction("recordEvent", (event: string) => events.push(event));

  const notes = new Map<string, string>();
  await installFakeTauriBridge(page, {
    files: { "extension.json": JSON.stringify(NOTES_MANIFEST), "extension.js": NOTES_EXTENSION_SOURCE },
    stubs: {
      "plugin:dialog|open": (args) => (args.title === "Open workspace" ? "/vault" : "/ext/capture-notes"),
      open_workspace: (args) => ({ workspace: { root_path: String(args.rootPath), name: "vault" }, files: [] }),
      list_workspace_entries: () => [],
      create_markdown_file: (args) => {
        const relativePath = String(args.relativePath);
        notes.set(relativePath, String(args.contents ?? ""));
        created.push(relativePath);
        return { relative_path: relativePath, name: relativePath, byte_size: 0, updated_at: null };
      },
      read_markdown_file: (args) => ({
        relative_path: String(args.relativePath),
        contents: notes.get(String(args.relativePath)) ?? ""
      }),
      read_app_settings: () => null,
      // The window reports its workspace root on load, so the shell has one
      // open before the extension runs.
      window_workspace_root: () => "/vault",
      sync_status: () => SYNC_STATUS_OFF
    }
  });

  await page.goto("/");
  await page.getByRole("button", { name: "Extensions", exact: true }).click();
  await page.getByRole("button", { name: "Add from folder…" }).click();
  await expect(page.getByRole("list", { name: "Installed extensions" })).toContainText("Capture Notes");

  await page.keyboard.press(OPEN_PALETTE);
  await page.getByRole("combobox", { name: "Search commands" }).fill("Capture note");
  await page.keyboard.press("Enter");

  // The note was written through the native bridge and opened as an editor tab.
  await expect.poll(() => created).toContain("captured.md");
  await expect(page.getByRole("navigation", { name: "Open tabs" })).toContainText("captured.md");

  // The same extension observed both moments through context.events.
  await expect.poll(() => events).toContain("created:captured.md");
  await expect.poll(() => events).toContain("opened:captured.md");
});

/**
 * The two APIs the journal needs: listing notes, and opening a tab of a kind
 * the extension itself contributed.
 */
const LISTING_EXTENSION_SOURCE = `
export function activate(context) {
  context.tabs.register({
    kind: "calendar",
    label: "Calendar",
    isAvailable: true,
    availability: "available",
    factory: () => null
  });
  context.commands.register({
    id: "list",
    title: "List journal notes",
    availability: "available",
    handler: async () => {
      const notes = await context.workspace.listNotes("journal");
      window.recordNotes?.(notes.map((note) => note.relativePath));
      context.tabs.open("calendar", "August 2026");
    }
  });
}
`;

const LISTING_MANIFEST = {
  id: "lister",
  name: "Lister",
  version: "1.0.0",
  apiVersion: "^1.0.0",
  engines: { platform: ["desktop"] },
  activationEvents: ["onCommand:list"],
  capabilities: [],
  contributes: { commands: [{ id: "list", title: "List journal notes" }], panels: [] }
};

test("an extension lists notes in a folder and opens its own contributed tab", async ({ page }) => {
  const listed: string[][] = [];
  // The extension source calls `window.recordNotes` from inside the page.
  await page.exposeFunction("recordNotes", (paths: string[]) => listed.push(paths));

  await installFakeTauriBridge(page, {
    files: { "extension.json": JSON.stringify(LISTING_MANIFEST), "extension.js": LISTING_EXTENSION_SOURCE },
    stubs: {
      "plugin:dialog|open": () => "/ext/lister",
      open_workspace: (args) => ({ workspace: { root_path: String(args.rootPath), name: "vault" }, files: [] }),
      list_workspace_entries: () => [
        entry("journal/2026/08/2026-08-07-1307.md", 30),
        entry("journal/cover.png", 20),
        entry("journalish/other.md", 10),
        entry("inbox/scratch.md", 5)
      ],
      read_app_settings: () => null,
      window_workspace_root: () => "/vault",
      sync_status: () => SYNC_STATUS_OFF
    }
  });

  await page.goto("/");
  await page.getByRole("button", { name: "Extensions", exact: true }).click();
  await page.getByRole("button", { name: "Add from folder…" }).click();
  await expect(page.getByRole("list", { name: "Installed extensions" })).toContainText("Lister");

  await page.keyboard.press(OPEN_PALETTE);
  await page.getByRole("combobox", { name: "Search commands" }).fill("List journal notes");
  await page.keyboard.press("Enter");

  // Markdown only, and the journal folder only — journalish/ does not match.
  await expect.poll(() => listed).toHaveLength(1);
  expect(listed[0]).toEqual(["journal/2026/08/2026-08-07-1307.md"]);

  // The extension opened a tab of the kind it registered.
  await expect(page.getByRole("navigation", { name: "Open tabs" })).toContainText("August 2026");
});

/** Builds a workspace entry the `list_workspace_entries` stub returns. */
function entry(relativePath: string, updatedAt: number | null) {
  return {
    relative_path: relativePath,
    name: relativePath.split("/").at(-1),
    parent_path: relativePath.split("/").slice(0, -1).join("/"),
    kind: "file",
    is_markdown: relativePath.endsWith(".md"),
    byte_size: 0,
    updated_at: updatedAt
  };
}
