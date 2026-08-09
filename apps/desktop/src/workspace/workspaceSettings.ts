import { isRecord } from "@thinkbrain/core";

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
 * Persists `settings` for `rootPath`, keeping every other key in the file.
 *
 * The read-modify-write lives here rather than in the caller because the file
 * is shared: the settings store writes every workspace-scoped setting into it,
 * including the journal's metadata fields. Serialising only this module's own
 * key replaced the whole document with `{"showHidden": …}` and silently deleted
 * the rest — which is how journal fields disappeared on restart.
 *
 * A document that will not parse is treated as absent: there is nothing to
 * preserve, and refusing to write would strand the preference instead.
 */
export async function writeWorkspaceSettings(rootPath: string, settings: WorkspaceSettings): Promise<void> {
  const raw = await invokeNativeCommand("read_workspace_settings", { rootPath });
  let base: Record<string, unknown> = {};
  if (typeof raw === "string" && raw.trim() !== "") {
    try {
      const parsed: unknown = JSON.parse(raw);
      if (isRecord(parsed)) base = parsed;
    } catch {
      // Malformed: fall through with an empty base.
    }
  }

  await invokeNativeCommand("write_workspace_settings", {
    rootPath,
    contents: JSON.stringify({ ...base, ...settings })
  });
}
