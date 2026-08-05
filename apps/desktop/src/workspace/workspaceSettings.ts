import { invokeNativeCommand } from "../native/commands";

/**
 * Per-workspace preferences persisted via the native
 * `read_workspace_settings` / `write_workspace_settings` commands.
 *
 * The on-disk document is a JSON object; only the fields enumerated here are
 * owned by this helper. Unknown keys are preserved by the host's read-modify-
 * write so future settings do not collide.
 */
export interface WorkspaceSettings {
  /** Whether dot-prefixed entries (`.git`, `.obsidian`, …) appear in the explorer. */
  readonly showHidden: boolean;
}

export const DEFAULT_WORKSPACE_SETTINGS: WorkspaceSettings = { showHidden: false };

/**
 * Parses a raw workspace-settings JSON document, falling back to defaults for
 * missing or malformed fields. A completely unparseable document yields the
 * defaults so a corrupted settings file never blocks workspace opening.
 */
export function parseWorkspaceSettings(raw: string | null | undefined): WorkspaceSettings {
  if (!raw) return DEFAULT_WORKSPACE_SETTINGS;
  try {
    const value = JSON.parse(raw) as Partial<WorkspaceSettings> & { showHidden?: unknown };
    return { showHidden: typeof value.showHidden === "boolean" ? value.showHidden : false };
  } catch {
    return DEFAULT_WORKSPACE_SETTINGS;
  }
}

/**
 * Reads the persisted workspace settings for `rootPath`, returning defaults
 * when the host has no document yet or the document is malformed.
 */
export async function readWorkspaceSettings(rootPath: string): Promise<WorkspaceSettings> {
  const raw = await invokeNativeCommand("read_workspace_settings", { rootPath });
  return parseWorkspaceSettings(raw);
}

/**
 * Persists `settings` for `rootPath`. The host performs an atomic write of the
 * supplied JSON document; callers are responsible for read-modify-write when
 * partial updates are needed.
 */
export async function writeWorkspaceSettings(rootPath: string, settings: WorkspaceSettings): Promise<void> {
  await invokeNativeCommand("write_workspace_settings", {
    rootPath,
    contents: JSON.stringify(settings)
  });
}
