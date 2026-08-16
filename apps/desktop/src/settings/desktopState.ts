import { invokeNativeCommand } from "../native/commands";
import { isRecord } from "@thinkbrain/core";

export const DESKTOP_STATE_VERSION = 5;
export const DESKTOP_STATE_KEY = "desktopState";
export const MAX_RECENT_WORKSPACES = 12;
export const MIN_PANEL_WIDTH = 224;
export const MAX_PANEL_WIDTH = 480;
export const DEFAULT_LEFT_PANEL_WIDTH = 288;
export const DEFAULT_RIGHT_PANEL_WIDTH = 320;

/** Serializable tab metadata persisted across restarts. */
export interface PersistedTab {
  readonly id: string;
  readonly title: string;
  readonly kind: string;
  readonly rootPath?: string;
  readonly relativePath?: string;
}

/**
 * Per-workspace, per-view collapsed group keys (D53).
 *
 * What a user collapsed in a panel is not a preference they configured, so it
 * lives here rather than in their settings — that document now takes
 * conflict-safe writes, and churning it on every toggle would collide with the
 * writes that are preferences. Nor in the vault: it describes this machine.
 */
export type WorkspaceViews = Readonly<
  Record<string, Readonly<Record<string, readonly string[]>>>
>;

/** One view's collapsed groups, in one workspace. */
export interface CollapsedGroupsUpdate {
  readonly workspacePath: string;
  readonly viewId: string;
  readonly collapsed: readonly string[];
}

export interface DesktopState {
  readonly version: typeof DESKTOP_STATE_VERSION;
  readonly lastWorkspacePath: string | null;
  readonly recentWorkspacePaths: readonly string[];
  readonly explorerOpen: boolean;
  readonly leftPanelWidth: number;
  readonly rightPanelWidth: number;
  readonly bottomPanelOpen: boolean;
  readonly developmentExtensionDirectories: readonly string[];
  readonly openTabs: readonly PersistedTab[];
  readonly activeTabId: string | null;
  readonly workspaceViews: WorkspaceViews;
}

export interface DesktopStateUpdate {
  readonly lastWorkspacePath?: string | null;
  readonly recentWorkspacePaths?: readonly string[];
  readonly explorerOpen?: boolean;
  readonly leftPanelWidth?: number;
  readonly rightPanelWidth?: number;
  readonly bottomPanelOpen?: boolean;
  readonly developmentExtensionDirectories?: readonly string[];
  readonly openTabs?: readonly PersistedTab[];
  readonly activeTabId?: string | null;
  /**
   * Targeted rather than the whole map, because two windows on two vaults write
   * this without knowing about each other: sending the entire map would make
   * each of them overwrite what the other had just recorded.
   */
  readonly collapsedGroups?: CollapsedGroupsUpdate;
}

export interface DesktopStateGateway {
  readAppSettings(): Promise<string | null>;
  /**
   * `expected` is the document this write's `contents` were revised from —
   * `null` when none existed. `write_app_settings` refuses the write if that
   * is no longer what is on disk (see `appSettingsFile.ts`), so the fallback
   * path below must send what it actually read rather than nothing.
   */
  writeAppSettings(contents: string, expected: string | null): Promise<void>;
  updateDesktopState?(update: DesktopStateUpdate): Promise<string>;
}

export const DEFAULT_DESKTOP_STATE: DesktopState = Object.freeze({
  version: DESKTOP_STATE_VERSION,
  lastWorkspacePath: null,
  recentWorkspacePaths: [],
  explorerOpen: true,
  leftPanelWidth: DEFAULT_LEFT_PANEL_WIDTH,
  rightPanelWidth: DEFAULT_RIGHT_PANEL_WIDTH,
  bottomPanelOpen: false,
  developmentExtensionDirectories: [],
  openTabs: [],
  activeTabId: null,
  workspaceViews: {}
});

const nativeDesktopStateGateway: DesktopStateGateway = {
  readAppSettings: () => invokeNativeCommand("read_app_settings"),
  async writeAppSettings(contents, expected) {
    await invokeNativeCommand("write_app_settings", { contents, expected });
  },
  updateDesktopState(update) {
    return invokeNativeCommand("update_desktop_state", { update });
  }
};

/**
 * Reads desktop-only shell state from the shared app-settings document.
 * Invalid documents and unsupported state versions fall back to safe defaults.
 */
export async function loadDesktopState(
  gateway: DesktopStateGateway = nativeDesktopStateGateway
): Promise<DesktopState> {
  return parseDesktopState(await gateway.readAppSettings());
}

let fallbackUpdateQueue: Promise<unknown> = Promise.resolve();

/**
 * Updates desktop-only state without rewriting theme, extension, or other app
 * settings. The write always uses the current desktop-state schema.
 */
export async function saveDesktopState(
  update: DesktopStateUpdate,
  gateway: DesktopStateGateway = nativeDesktopStateGateway
): Promise<DesktopState> {
  if (gateway.updateDesktopState) {
    return parseDesktopState(await gateway.updateDesktopState(update));
  }

  console.warn(
    "Using fallback desktop state update. " +
    "This may cause race conditions if multiple windows modify settings concurrently."
  );

  // This does not go through `appSettingsFile.ts`'s retrying chain: that chain
  // exists for the settings store, which is a real writer in the shipped app,
  // races with `update_desktop_state` on every save, and is exercised by every
  // build. This branch only runs for a caller-supplied gateway that omits
  // `updateDesktopState` — never `nativeDesktopStateGateway`, which always
  // defines it — so it has no writer to race against in practice. Sending
  // `expected` keeps a theoretical race a loud failure instead of a silent
  // overwrite; a retry loop here would be safety net for a path nothing takes.
  const performUpdate = async () => {
    const rawAppSettings = await gateway.readAppSettings();
    const appSettings = parseAppSettingsRecord(rawAppSettings);
    const current = readDesktopState(appSettings);
    const next = applyDesktopStateUpdate(current, update);

    appSettings[DESKTOP_STATE_KEY] = next;
    delete appSettings.lastWorkspacePath;
    delete appSettings.explorerOpen;

    await gateway.writeAppSettings(serializeAppSettingsRecord(appSettings), rawAppSettings);
    return next;
  };

  const result = fallbackUpdateQueue.then(performUpdate, performUpdate);
  fallbackUpdateQueue = result.catch(() => {});
  return result;
}

/**
 * Parses either the current nested schema or the prior flat desktop fields.
 * This is exported to keep migration and malformed-document behavior testable.
 */
export function parseDesktopState(contents: string | null): DesktopState {
  return readDesktopState(parseAppSettingsRecord(contents));
}

function parseAppSettingsRecord(contents: string | null): Record<string, unknown> {
  if (contents === null) {
    return {};
  }

  try {
    const parsed: unknown = JSON.parse(contents);
    return isRecord(parsed) ? { ...parsed } : {};
  } catch {
    return {};
  }
}

function readDesktopState(appSettings: Readonly<Record<string, unknown>>): DesktopState {
  const storedState = appSettings[DESKTOP_STATE_KEY];

  if (isRecord(storedState)) {
    return readVersionedDesktopState(storedState);
  }

  return createDesktopState({
    lastWorkspacePath: appSettings.lastWorkspacePath,
    explorerOpen: appSettings.explorerOpen
  });
}

function readVersionedDesktopState(storedState: Readonly<Record<string, unknown>>): DesktopState {
  const version = storedState.version;

  // Every schema is readable in both directions — each version only ever added
  // fields, so a missing one falls back to its default and one this build has
  // not heard of is simply not read. A *newer* document is the one that used to
  // cost the most: running a newer build and then an older one is a branch
  // switch, and rejecting the document lost the workspace, the tabs and the
  // layout in one go. Only a version that is not a version at all is grounds to
  // give up, because then nothing can be said about the rest of the record.
  if (version !== undefined && !(typeof version === "number" && Number.isInteger(version) && version >= 0)) {
    return DEFAULT_DESKTOP_STATE;
  }

  return createDesktopState(storedState);
}

function applyDesktopStateUpdate(
  state: DesktopState,
  update: DesktopStateUpdate
): DesktopState {
  return createDesktopState({
    lastWorkspacePath:
      update.lastWorkspacePath === undefined
        ? state.lastWorkspacePath
        : update.lastWorkspacePath,
    recentWorkspacePaths:
      update.recentWorkspacePaths === undefined
        ? promoteRecentWorkspace(state.recentWorkspacePaths, update.lastWorkspacePath)
        : mergeRecentWorkspacePaths(
            state.recentWorkspacePaths,
            normalizeWorkspacePaths(update.recentWorkspacePaths)
          ),
    explorerOpen: update.explorerOpen === undefined ? state.explorerOpen : update.explorerOpen,
    leftPanelWidth:
      update.leftPanelWidth === undefined ? state.leftPanelWidth : update.leftPanelWidth,
    rightPanelWidth:
      update.rightPanelWidth === undefined ? state.rightPanelWidth : update.rightPanelWidth,
    bottomPanelOpen:
      update.bottomPanelOpen === undefined ? state.bottomPanelOpen : update.bottomPanelOpen,
    developmentExtensionDirectories:
      update.developmentExtensionDirectories === undefined
        ? state.developmentExtensionDirectories
        : update.developmentExtensionDirectories,
    openTabs: update.openTabs === undefined ? state.openTabs : update.openTabs,
    activeTabId: update.activeTabId === undefined ? state.activeTabId : update.activeTabId,
    workspaceViews: applyCollapsedGroups(state.workspaceViews, update.collapsedGroups)
  });
}

/**
 * Records one view's collapsed groups.
 *
 * Unlike the native path this does not prune workspaces the app has forgotten:
 * this branch only runs for a caller-supplied gateway without
 * `updateDesktopState`, which the shipped app never takes.
 */
function applyCollapsedGroups(
  views: WorkspaceViews,
  update: CollapsedGroupsUpdate | undefined
): WorkspaceViews {
  if (update === undefined) return views;
  return {
    ...views,
    [update.workspacePath]: {
      ...views[update.workspacePath],
      [update.viewId]: update.collapsed
    }
  };
}

function createDesktopState(value: Readonly<Record<string, unknown>>): DesktopState {
  const lastWorkspacePath = readNonEmptyString(value.lastWorkspacePath);
  return {
    version: DESKTOP_STATE_VERSION,
    lastWorkspacePath,
    recentWorkspacePaths: normalizeWorkspacePaths(value.recentWorkspacePaths, lastWorkspacePath),
    explorerOpen:
      typeof value.explorerOpen === "boolean"
        ? value.explorerOpen
        : DEFAULT_DESKTOP_STATE.explorerOpen,
    leftPanelWidth: readPanelWidth(value.leftPanelWidth, DEFAULT_LEFT_PANEL_WIDTH),
    rightPanelWidth: readPanelWidth(value.rightPanelWidth, DEFAULT_RIGHT_PANEL_WIDTH),
    bottomPanelOpen:
      typeof value.bottomPanelOpen === "boolean"
        ? value.bottomPanelOpen
        : DEFAULT_DESKTOP_STATE.bottomPanelOpen,
    developmentExtensionDirectories: normalizeExtensionDirectories(
      value.developmentExtensionDirectories
    ),
    openTabs: readPersistedTabs(value.openTabs),
    activeTabId: readNonEmptyString(value.activeTabId),
    workspaceViews: readWorkspaceViews(value.workspaceViews)
  };
}

/**
 * Reads the stored collapsed groups, skipping anything malformed.
 *
 * A hand-edited or truncated document must cost the user a group that reopened,
 * never a panel that will not draw.
 */
function readWorkspaceViews(value: unknown): WorkspaceViews {
  if (!isRecord(value)) return {};
  const views: Record<string, Record<string, readonly string[]>> = {};
  for (const [workspacePath, stored] of Object.entries(value)) {
    if (!isRecord(stored)) continue;
    const byView: Record<string, readonly string[]> = {};
    for (const [viewId, collapsed] of Object.entries(stored)) {
      if (!Array.isArray(collapsed)) continue;
      byView[viewId] = collapsed.filter((key): key is string => typeof key === "string");
    }
    views[workspacePath] = byView;
  }
  return views;
}

/**
 * The groups collapsed in one view of one workspace, or none.
 *
 * A workspace nothing was stored for reads the same as one stored empty: every
 * group open, which is the right answer for a panel opened for the first time.
 */
export function collapsedGroups(
  state: DesktopState,
  workspacePath: string | null,
  viewId: string
): readonly string[] {
  if (workspacePath === null) return [];
  return state.workspaceViews[workspacePath]?.[viewId] ?? [];
}

/**
 * Deduplicates extension directories without resolving them: a directory that
 * is temporarily missing must stay stored so the user can fix it.
 */
function normalizeExtensionDirectories(value: unknown): readonly string[] {
  const directories = Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string" && entry.length > 0)
    : [];
  return [...new Set(directories)];
}

/** Reads and validates the persisted tab list from a desktop-state record. */
function readPersistedTabs(value: unknown): readonly PersistedTab[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((entry): entry is Record<string, unknown> => isRecord(entry))
    .map((entry) => ({
      id: typeof entry.id === "string" ? entry.id : "",
      title: typeof entry.title === "string" ? entry.title : "",
      kind: typeof entry.kind === "string" ? entry.kind : "editor",
      ...(typeof entry.rootPath === "string" && entry.rootPath ? { rootPath: entry.rootPath } : {}),
      ...(typeof entry.relativePath === "string" && entry.relativePath
        ? { relativePath: entry.relativePath }
        : {})
    }))
    .filter((tab) => tab.id.length > 0);
}

/** Reads a non-empty string value, or null when absent/invalid. */
function readNonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

/** Clamps a dock width to the range that keeps the shell usable. */
export function clampPanelWidth(width: number): number {
  return Math.max(MIN_PANEL_WIDTH, Math.min(MAX_PANEL_WIDTH, width));
}

function readPanelWidth(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value)
    ? clampPanelWidth(value)
    : fallback;
}

function normalizeWorkspacePaths(value: unknown, fallback?: string | null): readonly string[] {
  const paths = Array.isArray(value)
    ? value.filter((path): path is string => typeof path === "string" && path.length > 0)
    : [];
  return promoteRecentWorkspace(paths, fallback);
}

export function promoteRecentWorkspace(paths: readonly string[], path: string | null | undefined): readonly string[] {
  const unique = [...new Set(path ? [path, ...paths] : paths)];
  return unique.slice(0, MAX_RECENT_WORKSPACES);
}

/**
 * Merges an explicitly provided recent-workspace list with the stored one
 * instead of replacing it outright. A caller's list can be stale relative to
 * another window's concurrent write, so this preserves entries neither side
 * sent explicitly (mirrors Rust's `merge_recent_workspace_paths`).
 */
function mergeRecentWorkspacePaths(
  current: readonly string[],
  incoming: readonly string[]
): readonly string[] {
  return promoteRecentWorkspace([...incoming, ...current], undefined);
}

function serializeAppSettingsRecord(appSettings: Readonly<Record<string, unknown>>): string {
  return `${JSON.stringify(appSettings, null, 2)}\n`;
}
