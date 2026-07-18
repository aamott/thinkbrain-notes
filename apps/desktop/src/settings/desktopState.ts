import { invokeNativeCommand } from "../native/commands";

export const DESKTOP_STATE_VERSION = 2;
export const DESKTOP_STATE_KEY = "desktopState";
export const MAX_RECENT_WORKSPACES = 12;

export interface DesktopState {
  readonly version: typeof DESKTOP_STATE_VERSION;
  readonly lastWorkspacePath: string | null;
  readonly recentWorkspacePaths: readonly string[];
  readonly explorerOpen: boolean;
}

export interface DesktopStateUpdate {
  readonly lastWorkspacePath?: string | null;
  readonly recentWorkspacePaths?: readonly string[];
  readonly explorerOpen?: boolean;
}

export interface DesktopStateGateway {
  readAppSettings(): Promise<string | null>;
  writeAppSettings(contents: string): Promise<void>;
  updateDesktopState?(update: DesktopStateUpdate): Promise<string>;
}

export const DEFAULT_DESKTOP_STATE: DesktopState = Object.freeze({
  version: DESKTOP_STATE_VERSION,
  lastWorkspacePath: null,
  recentWorkspacePaths: [],
  explorerOpen: true
});

const nativeDesktopStateGateway: DesktopStateGateway = {
  readAppSettings: () => invokeNativeCommand("read_app_settings"),
  async writeAppSettings(contents) {
    await invokeNativeCommand("write_app_settings", { contents });
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

  const appSettings = parseAppSettingsRecord(await gateway.readAppSettings());
  const current = readDesktopState(appSettings);
  const next = applyDesktopStateUpdate(current, update);

  appSettings[DESKTOP_STATE_KEY] = next;
  delete appSettings.lastWorkspacePath;
  delete appSettings.explorerOpen;

  await gateway.writeAppSettings(serializeAppSettingsRecord(appSettings));
  return next;
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

  if (version !== undefined && version !== 0 && version !== 1 && version !== DESKTOP_STATE_VERSION) {
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
        : normalizeWorkspacePaths(update.recentWorkspacePaths),
    explorerOpen: update.explorerOpen === undefined ? state.explorerOpen : update.explorerOpen
  });
}

function createDesktopState(value: Readonly<Record<string, unknown>>): DesktopState {
  const lastWorkspacePath = readWorkspacePath(value.lastWorkspacePath);
  return {
    version: DESKTOP_STATE_VERSION,
    lastWorkspacePath,
    recentWorkspacePaths: normalizeWorkspacePaths(value.recentWorkspacePaths, lastWorkspacePath),
    explorerOpen:
      typeof value.explorerOpen === "boolean"
        ? value.explorerOpen
        : DEFAULT_DESKTOP_STATE.explorerOpen
  };
}

function readWorkspacePath(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
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

function serializeAppSettingsRecord(appSettings: Readonly<Record<string, unknown>>): string {
  return `${JSON.stringify(appSettings, null, 2)}\n`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
