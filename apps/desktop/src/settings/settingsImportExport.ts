/**
 * Settings import/export logic (Story 6).
 *
 * Keeps the store file under 500 lines by separating the export payload
 * computation, file I/O, and import validation into this dedicated module.
 *
 * Export flow:
 *   1. `buildExportPayload()` — pure function reading the store's `appValues`.
 *      Returns the pretty-printed JSON string plus a list of non-portable
 *      settings whose current values differ from their defaults (so the UI can
 *      show a warning dialog before writing the file).
 *   2. `writeExportFile(json)` — opens a native save dialog and writes the JSON
 *      to the chosen path. Returns `true` if written, `false` if cancelled.
 *
 * Import flow:
 *   `importSettings()` — opens a native open dialog, reads the JSON file,
 *   validates each key against the registry, and stages known/valid keys via
 *   `stageChange`. Unknown keys and type mismatches are counted and ignored.
 *   Imported values are STAGED, not saved — the user reviews and clicks Save.
 *
 * Per epic design decision #6, only app-scoped settings are exported. Workspace
 * settings are NOT included.
 */

import {
  CURRENT_SETTINGS_VERSION,
  type SettingDefinition,
  type SettingType
} from "@thinkbrain/core";

import { appSettingsRegistry, useSettingsStore } from "./settingsStore";
import { saveFilePath, pickFilePath } from "../native/dialogs";
import { writeTextFileNative, readTextFileNative } from "../native/fs";

// ---------------------------------------------------------------------------
// Export.
// ---------------------------------------------------------------------------

/** Result of building the export payload (pure, no side effects). */
export interface ExportPayload {
  /** Pretty-printed JSON string ready to write to a file. */
  readonly json: string;
  /** Non-portable settings with non-default values (for the warning dialog). */
  readonly portableWarnings: readonly SettingDefinition[];
}

/**
 * Builds the export payload from the store's current app-scoped values.
 *
 * This is a pure function: it reads `useSettingsStore.getState().appValues` and
 * the registry, then returns the JSON string and a list of non-portable
 * settings whose current values differ from their defaults. The caller decides
 * whether to proceed (after showing a warning) and writes the file via
 * `writeExportFile`.
 *
 * Only app-scoped settings are included (per epic design decision #6).
 *
 * Returns:
 *   The {@link ExportPayload} with the JSON string and portable warnings.
 */
export function buildExportPayload(): ExportPayload {
  const { appValues } = useSettingsStore.getState();

  // Collect all app-scoped setting values (defaults merged in the store).
  const settings: Record<string, unknown> = {};
  const portableWarnings: SettingDefinition[] = [];

  for (const def of appSettingsRegistry.getAllDefinitions()) {
    // Only app-scoped settings are exported; workspace settings are excluded.
    if (def.scope !== "app") continue;

    const value = def.key in appValues ? appValues[def.key] : def.default;
    settings[def.key] = value;

    // Flag non-portable settings (e.g. path types) with non-default values so
    // the UI can warn the user before exporting.
    const isPortable = def.portable ?? true;
    if (!isPortable && value !== def.default) {
      portableWarnings.push(def);
    }
  }

  const payload = {
    version: CURRENT_SETTINGS_VERSION,
    settings
  };

  return {
    json: `${JSON.stringify(payload, null, 2)}\n`,
    portableWarnings
  };
}

/**
 * Opens a native save dialog and writes the export JSON to the chosen path.
 *
 * Args:
 *   json: The JSON string to write (from `buildExportPayload`).
 *
 * Returns:
 *   `true` if the file was written, `false` if the user cancelled the dialog
 *   or the runtime is not Tauri.
 */
export async function writeExportFile(json: string): Promise<boolean> {
  const path = await saveFilePath("Export settings", "thinkbrain-settings.json");
  if (path === null) return false;

  return writeTextFileNative(path, json);
}

// ---------------------------------------------------------------------------
// Import.
// ---------------------------------------------------------------------------

/** Result of an import operation with counts for user feedback. */
export interface ImportResult {
  /** Number of known, valid keys staged. */
  readonly imported: number;
  /** Number of unknown keys ignored (not in the registry). */
  readonly ignored: number;
  /** Number of keys whose value type didn't match the definition. */
  readonly typeMismatches: number;
}

/** Type guard for a plain JSON object record. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

/**
 * Checks whether an imported value matches the setting's declared type.
 *
 * For `enum` settings, the value must be one of the declared `options`. For
 * `number`, the value must be a finite number. For `path` and `string`, the
 * value must be a string. For `boolean`, the value must be a boolean.
 *
 * Args:
 *   def: The setting definition to validate against.
 *   value: The imported value to check.
 *
 * Returns:
 *   `true` if the value is valid for the definition's type.
 */
function isValueTypeValid(def: SettingDefinition, value: unknown): boolean {
  const type: SettingType = def.type;
  switch (type) {
    case "boolean":
      return typeof value === "boolean";
    case "number":
      return typeof value === "number" && Number.isFinite(value);
    case "string":
      return typeof value === "string";
    case "path":
      // Paths are strings; the portability warning is handled at export time.
      return typeof value === "string";
    case "enum":
      return (
        typeof value === "string" &&
        Boolean(def.options?.includes(value))
      );
    default:
      // Unknown setting types are rejected to fail loudly.
      return false;
  }
}

/**
 * Extracts the settings map from a parsed import JSON document.
 *
 * Accepts both the canonical format `{ "version": N, "settings": { ... } }` and
 * a bare settings object `{ ... }` (graceful fallback).
 *
 * Args:
 *   parsed: The parsed JSON value from the import file.
 *
 * Returns:
 *   The settings record, or `null` if the document is malformed.
 */
function extractSettingsMap(parsed: unknown): Record<string, unknown> | null {
  if (!isRecord(parsed)) return null;

  // Canonical format: { version, settings }.
  if ("settings" in parsed && isRecord(parsed.settings)) {
    return parsed.settings;
  }

  // Bare format: the top-level object IS the settings map.
  // Heuristic: if it has a "version" key but no "settings" key, it's likely
  // the canonical wrapper without the settings field — treat as malformed.
  if ("version" in parsed && !("settings" in parsed)) {
    return null;
  }

  return parsed;
}

/**
 * Imports settings from a JSON file chosen via a native open dialog.
 *
 * Reads the file, validates each key against the registry, and stages known/
 * valid keys via `stageChange`. Unknown keys and type mismatches are counted
 * and ignored. Imported values are STAGED, not saved — the user reviews and
 * clicks Save.
 *
 * Returns:
 *   The {@link ImportResult} with counts, or `null` if the user cancelled the
 *   dialog or the file could not be read.
 */
export async function importSettings(): Promise<ImportResult | null> {
  const path = await pickFilePath("Import settings");
  if (path === null) return null;

  const raw = await readTextFileNative(path);
  if (raw === null) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    // Malformed JSON — treat as an empty import with all keys ignored.
    return { imported: 0, ignored: 0, typeMismatches: 0 };
  }

  const settingsMap = extractSettingsMap(parsed);
  if (settingsMap === null) {
    return { imported: 0, ignored: 0, typeMismatches: 0 };
  }

  const store = useSettingsStore.getState();
  let imported = 0;
  let ignored = 0;
  let typeMismatches = 0;

  for (const [key, value] of Object.entries(settingsMap)) {
    const def = appSettingsRegistry.getDefinition(key);
    if (def === undefined) {
      // Unknown key — not in the registry. Silently ignore and count.
      ignored++;
      continue;
    }

    if (!isValueTypeValid(def, value)) {
      // Type mismatch — the value doesn't match the definition's type.
      typeMismatches++;
      continue;
    }

    // Valid known key — stage it for the user to review and Save.
    store.stageChange(key, value);
    imported++;
  }

  return { imported, ignored, typeMismatches };
}
