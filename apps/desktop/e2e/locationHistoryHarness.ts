import { expect, type Page } from "@playwright/test";

/**
 * Shared fake-vault harness for the location-centric history specs.
 *
 * Installs a `__TAURI_INTERNALS__.invoke` dispatcher that serves one
 * disposable vault — `/workspace/history-vault` — from an in-memory document
 * map held on the Node side (via `exposeFunction`, the same pattern
 * `extensions.spec.ts` uses). Only the renderer's native-adapter calls are
 * mocked; any command the harness does not know throws, so a new IPC surface
 * fails loudly instead of silently returning `undefined`. Every rejection —
 * including ones the shell catches internally — is recorded and surfaced by
 * {@link expectNoNativeFailures}.
 */

const HISTORY_VAULT_ROOT = "/workspace/history-vault";

type InvokeArgs = Record<string, unknown>;

/** Sync status: off, nothing pending — the shape `extensions.spec.ts` uses. */
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

/**
 * ~350-line note: an H1 at the top, an H2 ("Beta Section") in the back half,
 * and an H2 ("Omega Tail") close enough to the end that the scroller clamps
 * instead of putting the heading at the viewport top — exercises outline
 * jumps whose landing position cannot equal `scrollIntoView`-to-top. Filler
 * lines are unique and deliberately short — no soft-wrapping, so a panel
 * opening and resizing the editor cannot reflow line heights between
 * measurements.
 */
const GUIDE_DOC = [
  "# Guide Alpha",
  "",
  ...Array.from({ length: 300 }, (_, i) => `guide filler line ${i + 1}`),
  "",
  "## Beta Section",
  "",
  ...Array.from({ length: 30 }, (_, i) => `guide tail line ${i + 1}`),
  "",
  "## Omega Tail",
  "",
  ...Array.from({ length: 10 }, (_, i) => `guide end line ${i + 1}`)
].join("\n");

/** A short note that links to `bravo.md` near the top of the first viewport. */
const ALPHA_DOC = [
  "# Alpha Doc",
  "",
  "[Open bravo](bravo.md)",
  "",
  ...Array.from({ length: 80 }, (_, i) => `alpha filler line ${i + 1}`)
].join("\n");

const BRAVO_DOC = [
  "# Bravo Doc",
  "",
  ...Array.from({ length: 60 }, (_, i) => `bravo filler line ${i + 1}`)
].join("\n");

/** The default document set for the fake vault. */
function historyVaultDocs(): Record<string, string> {
  return { "guide.md": GUIDE_DOC, "alpha.md": ALPHA_DOC, "bravo.md": BRAVO_DOC };
}

/**
 * Installs the fake Tauri bridge serving `docs` at `/workspace/history-vault`.
 * `window_workspace_root` reports the vault on load, so the shell opens it
 * before the test interacts with the page — no picker needed.
 */
/** What a full desktop host reports for both capability probes. */
const DESKTOP_HOST_CAPABILITIES = {
  canOpenFolder: true,
  canCreateManagedWorkspace: false,
  opensWorkspaceInNewWindow: true
} as const;

export async function installHistoryVault(
  page: Page,
  docs: Record<string, string> = historyVaultDocs()
): Promise<void> {
  const documents = new Map(Object.entries(docs));
  const failures: string[] = [];
  let nextEventId = 0;
  const entryFor = (relativePath: string) => ({
    relative_path: relativePath,
    name: relativePath.split("/").at(-1),
    file_name: relativePath.split("/").at(-1),
    parent_path: "",
    byte_size: documents.get(relativePath)?.length ?? 0,
    updated_at: null
  });

  const dispatch = (command: string, args: InvokeArgs): unknown => {
    if (command === "plugin:dialog|open") return HISTORY_VAULT_ROOT;
    if (command === "window_workspace_root") return HISTORY_VAULT_ROOT;
    if (command === "read_app_settings") return null;
    if (command === "write_app_settings") return null;
    if (command === "update_desktop_state") return null;
    if (command === "platform_capabilities") {
      return { ...DESKTOP_HOST_CAPABILITIES, canSpawnProcess: true, canCopyFilesToClipboard: true, hasKeychain: true };
    }
    if (command === "workspace_access_capabilities") return { ...DESKTOP_HOST_CAPABILITIES };
    if (command === "list_known_workspaces") return [];
    if (command === "read_workspace_settings") return null;
    if (command === "write_workspace_settings") return null;
    if (command === "watch_workspace") return HISTORY_VAULT_ROOT;
    if (command === "unwatch_workspace") return null;
    if (command === "plugin:event|listen") return ++nextEventId;
    if (command === "plugin:event|unlisten") return null;
    if (command === "plugin:updater|check") return null;
    // Idle-sync backdrop: no quarantined settings, no conflicts, an empty
    // rate report, and indexing clears without complaint.
    if (command === "quarantined_settings") return [];
    if (command === "list_conflicts") return [];
    if (command === "sync_conflict_rate") return { decisions: 0, settled: 0, recorded: 0 };
    if (command === "clear_index") return null;
    // Indexing reports how many documents it was handed.
    if (command === "index_documents") return (args.documents as readonly unknown[]).length;
    if (command === "open_workspace") {
      return {
        workspace: { root_path: String(args.rootPath), name: "history-vault" },
        files: [...documents.keys()].map(entryFor)
      };
    }
    if (command === "list_workspace_entries") {
      return [...documents.keys()].map((relativePath) => ({
        ...entryFor(relativePath),
        kind: "file",
        is_markdown: true
      }));
    }
    if (command === "read_markdown_file") {
      const relativePath = String(args.relativePath);
      const contents = documents.get(relativePath);
      if (contents === undefined) throw new Error(`history-vault: no such document ${relativePath}`);
      return { relative_path: relativePath, contents };
    }
    if (command === "write_markdown_file") {
      const relativePath = String(args.relativePath);
      documents.set(relativePath, String(args.contents));
      return entryFor(relativePath);
    }
    if (command === "sync_status") return SYNC_STATUS_OFF;
    throw new Error(`Unexpected native command: ${command}`);
  };

  // The dispatcher runs in Node, so the document map and failure list are
  // real closures — writes persist for later reads without sessionStorage
  // plumbing, and rejections the app catches still land in `failures`.
  await page.exposeFunction("__tnHistoryInvoke", (command: string, args: InvokeArgs): unknown => {
    try {
      return dispatch(command, args);
    } catch (error) {
      failures.push(`${command}: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  });
  await page.exposeFunction("__tnHistoryFailures", () => [...failures]);

  await page.addInitScript(() => {
    // `exposeFunction` installs the binding outside the page's own typings —
    // one deliberate unknown intermediary names the whole fake bridge shape.
    const appWindow = window as unknown as {
      isTauri?: boolean;
      __TAURI_INTERNALS__?: {
        invoke: (command: string, args: InvokeArgs) => Promise<unknown>;
        transformCallback: (callback?: (value: unknown) => void, once?: boolean) => number;
        unregisterCallback: (id: number) => void;
      };
      __tnHistoryInvoke: (command: string, args: InvokeArgs) => Promise<unknown>;
    };
    appWindow.isTauri = true;
    // `transformCallback`/`unregisterCallback` back `@tauri-apps/api/event`'s
    // `listen`: it hands each handler a numeric id that flows through
    // `plugin:event|listen`. The vault never emits native events, so storing
    // the callbacks for later lookup is all the fake needs.
    const callbacks = new Map<number, (value: unknown) => void>();
    let nextCallbackId = 0;
    appWindow.__TAURI_INTERNALS__ = {
      invoke: (command, args) => appWindow.__tnHistoryInvoke(command, args),
      transformCallback: (callback) => {
        const id = ++nextCallbackId;
        if (callback) callbacks.set(id, callback);
        return id;
      },
      unregisterCallback: (id) => {
        callbacks.delete(id);
      }
    };
  });
}

/**
 * End-of-test honesty check: no invoke failed — even ones the shell caught
 * internally (capability probes, missing commands) — and no error toast is
 * on screen. Without this, a rejection the app swallows would leave the test
 * green while the harness was actually broken.
 */
export async function expectNoNativeFailures(page: Page): Promise<void> {
  const failures = await page.evaluate(() => {
    const read = (window as { __tnHistoryFailures?: () => Promise<string[]> }).__tnHistoryFailures;
    return read ? read() : Promise.resolve(["__tnHistoryFailures missing — installHistoryVault not run"]);
  });
  expect(failures, "native invoke failures").toEqual([]);
  // Error-variant notifications render as `role="alert"` asides.
  await expect(page.locator('aside[role="alert"]')).toHaveCount(0);
}

/** Scroll/selection evidence read straight from the live editor DOM. */
export interface EditorSpot {
  /** `.cm-scroller.scrollTop` — the real viewport position. */
  readonly scrollTop: number;
  /** Text of the first `.cm-line` intersecting the scroller viewport. */
  readonly firstLine: string | null;
  /** Texts of every `.cm-line` intersecting the scroller viewport, top first. */
  readonly visibleLines: readonly string[];
  /** Text of the `.cm-line` holding the DOM selection anchor, if any. */
  readonly selectionLine: string | null;
  /** `getSelection().anchorOffset` when the anchor lives inside the editor. */
  readonly selectionOffset: number | null;
  /** Whether the CodeMirror surface currently owns DOM focus. */
  readonly editorFocused: boolean;
}

/**
 * Measures where the mounted CodeMirror editor actually is: which line is
 * first on screen, how far the scroller is down, and where the DOM Selection
 * sits. Returns `null` when no editor is mounted — which itself is the
 * signal some Back destinations produce.
 */
function editorSpot(page: Page): Promise<EditorSpot | null> {
  return page.evaluate(() => {
    const scroller = document.querySelector<HTMLElement>(".cm-scroller");
    if (!scroller) return null;
    const scrollerRect = scroller.getBoundingClientRect();
    const visibleLines = [...document.querySelectorAll<HTMLElement>(".cm-line")]
      .filter((line) => {
        const rect = line.getBoundingClientRect();
        return rect.bottom > scrollerRect.top && rect.top < scrollerRect.bottom;
      })
      .map((line) => line.textContent ?? "");
    const firstVisible = visibleLines[0] ?? null;
    const selection = window.getSelection();
    const anchorElement =
      selection?.anchorNode instanceof Element
        ? selection.anchorNode
        : (selection?.anchorNode?.parentElement ?? null);
    const selectionLine = anchorElement?.closest(".cm-line")?.textContent ?? null;
    return {
      scrollTop: scroller.scrollTop,
      firstLine: firstVisible,
      visibleLines,
      selectionLine,
      selectionOffset: selectionLine === null ? null : (selection?.anchorOffset ?? null),
      editorFocused:
        document.querySelector(".cm-editor")?.classList.contains("cm-focused") ?? false
    };
  });
}

/**
 * Waits for CodeMirror's viewport to stop moving and returns the settled
 * measurement. Scroll restores land a frame after dispatch — poll until two
 * consecutive reads agree instead of sleeping blind.
 */
export async function settledEditorSpot(page: Page): Promise<EditorSpot> {
  let previous: EditorSpot | null = null;
  let latest: EditorSpot | null = null;
  await expect
    .poll(async () => {
      latest = await editorSpot(page);
      const stable =
        latest !== null &&
        previous !== null &&
        latest.scrollTop === previous.scrollTop &&
        latest.firstLine === previous.firstLine;
      previous = latest;
      return stable;
    })
    .toBe(true);
  return latest!;
}
