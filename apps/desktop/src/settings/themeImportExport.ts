/**
 * Theme import/export logic (Story 3 of the importable themes feature).
 *
 * Mirrors the pattern in `./settingsImportExport.ts`: a pure-ish payload builder,
 * a native-dialog-backed file writer, and an import flow that stages (not saves)
 * the result so the user reviews and clicks Save in the settings tab.
 *
 * Export flow:
 *   1. `buildThemeExportPayload()` — reads the currently active theme state from
 *      the DOM (the `data-thinkbrain-theme` attribute for the base palette, and
 *      `getComputedStyle` for each known color token) and serializes it via
 *      `serializeThemeFile`. The DOM-reading helper is split out
 *      (`readCurrentTokenValues`) so tests can mock it without touching the real
 *      DOM. When a custom theme file is active (`appearance.themeFile` is set),
 *      the computed values already include its overrides, so the exported file
 *      captures exactly what the user sees — a useful starting point for
 *      customization.
 *   2. `writeThemeExportFile(json)` — opens a native save dialog and writes the
 *      JSON to the chosen path. Returns `true` if written, `false` if the user
 *      cancelled the dialog, and throws on write failure (disk full, permission
 *      denied, etc.) so the caller can surface a status message.
 *
 * Import flow:
 *   `importTheme()` — opens a native open dialog, reads the file, parses it with
 *   `parseThemeFile`. On success, stages `appearance.themeFile` to the selected
 *   path via `stageChange` (so the ThemeProvider picks it up). Returns a result
 *   with the theme name and any diagnostics. On parse failure, returns the
 *   diagnostics so the UI can show them. Returns `null` if the user cancelled
 *   the dialog or the file couldn't be read.
 *
 * Imported theme file paths are STAGED (not saved) — the user clicks Save in the
 * settings tab to persist, matching the settings import pattern.
 */

import {
  KNOWN_THEME_TOKENS,
  parseThemeFile,
  serializeThemeFile,
  type ThemeBase,
  type ThemeDiagnostic,
  type ThemeFile
} from "@thinkbrain/core";

import { appSettingsRegistry, useSettingsStore } from "./settingsStore";
import { resolveEffectiveValue } from "./settingsHelpers";
import { readThemeFile } from "./themeAdapter";
import { readPickedFile, writeJsonViaSaveDialog } from "./importExportFiles";

// ---------------------------------------------------------------------------
// DOM access (split out for testability).
// ---------------------------------------------------------------------------

/**
 * Reads the current value of every known theme color token from the document
 * root via `getComputedStyle`.
 *
 * This is the only DOM touchpoint in the module; splitting it out lets tests
 * mock the DOM read without stubbing `getComputedStyle` globally. Tokens whose
 * computed value is empty (e.g. not defined on the root) are skipped so the
 * exported file only carries populated tokens.
 *
 * Returns:
 *   A map of token name to its current CSS value (e.g. `"#ffffff"`).
 */
export function readCurrentTokenValues(): Record<string, string> {
  const root = document.documentElement;
  const style = getComputedStyle(root);
  const values: Record<string, string> = {};
  for (const token of KNOWN_THEME_TOKENS) {
    // `getPropertyValue` returns the trimmed value or "" if the custom property
    // is not set. Skip empties so the exported theme stays clean.
    const value = style.getPropertyValue(token).trim();
    if (value.length > 0) {
      values[token] = value;
    }
  }
  return values;
}

/**
 * Reads the currently active base palette from the root element's
 * `data-thinkbrain-theme` attribute.
 *
 * The ThemeProvider sets this attribute to `"light"`, `"dark"`, or `"system"`.
 * Custom theme files force it to the file's base, so reading it here captures
 * the effective base even when a custom theme is active. A `.tbtheme.json`
 * `base` must be a concrete palette (per `ThemeBase`), so `"system"` cannot be
 * exported directly. Instead, `"system"` (and any missing/unexpected value) is
 * resolved against the OS color-scheme preference via `matchMedia` so the
 * exported base matches the palette the user actually sees. Without this, a
 * dark-OS user on "system" would export a file with dark token values but
 * `base: "light"` — a self-contradictory theme that fails to round-trip.
 *
 * Returns:
 *   The active base palette (`"light"` or `"dark"`).
 */
export function readCurrentThemeBase(): ThemeBase {
  const raw = document.documentElement.dataset.thinkbrainTheme;
  if (raw === "light") return "light";
  if (raw === "dark") return "dark";
  // "system", missing, or unexpected: resolve via the OS color-scheme
  // preference so the exported base matches the palette the user actually
  // sees. Without this, a dark-OS user on "system" would export a file with
  // dark token values but base "light" — a self-contradictory theme.
  if (typeof window !== "undefined" && window.matchMedia) {
    return window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light";
  }
  return "light";
}

// ---------------------------------------------------------------------------
// Export.
// ---------------------------------------------------------------------------

/** Result of building the theme export payload. */
export interface ThemeExportPayload {
  /** Pretty-printed `.tbtheme.json` string ready to write to a file. */
  readonly json: string;
}

/**
 * Builds a `.tbtheme.json` payload from the currently active theme state.
 *
 * Reads the active base palette and each known color token from the DOM, then
 * serializes via `serializeThemeFile`. The exported `name` is the constant
 * `"Exported Theme"` — the user can rename it after import or by editing the
 * file. `version` is `1` (the current theme file schema version).
 *
 * When a custom theme file is active, the computed token values already include
 * its overrides, so the export captures the user's effective theme. This makes
 * export a useful "snapshot current state" action for customization.
 *
 * Returns:
 *   The {@link ThemeExportPayload} with the canonical JSON string.
 */
export function buildThemeExportPayload(): ThemeExportPayload {
  const base = readCurrentThemeBase();
  const tokens = readCurrentTokenValues();

  const theme: ThemeFile = {
    name: "Exported Theme",
    base,
    version: 1,
    tokens
  };

  return { json: serializeThemeFile(theme) };
}

/**
 * Builds the payload to export, preferring the active theme file's own bytes.
 *
 * A snapshot is taken from `getComputedStyle`, which reports resolved values:
 * a token authored as `var(--tn-color-accent)` or `color-mix(...)` comes back
 * as the colour it produced, and the authoring structure is gone. That is the
 * right answer when the user is on a built-in palette — there is no source file
 * to be faithful to. When they are running a theme file, that file already says
 * exactly what they see, so exporting it verbatim round-trips where a snapshot
 * of it silently would not.
 *
 * Falls back to the snapshot when the file cannot be read or no longer parses:
 * a broken source is worth less than a working snapshot, and refusing to export
 * at all helps nobody.
 */
export async function buildThemeExport(): Promise<ThemeExportPayload> {
  const state = useSettingsStore.getState();
  // Resolve the effective themeFile path via the shared precedence rule
  // (staged > appValues > registry default of null). Avoids the inline-copy
  // drift where the manual version omitted the default fallback.
  const configured = resolveEffectiveValue(
    "appearance.themeFile",
    state.stagedChanges,
    state.appValues,
    state.workspaceValues,
    appSettingsRegistry.getDefinition("appearance.themeFile")
  );

  if (typeof configured === "string" && configured.length > 0) {
    const source = await readThemeFile(configured);
    if (source !== null && parseThemeFile(source).theme !== null) {
      return { json: source };
    }
  }

  return buildThemeExportPayload();
}

/**
 * Opens a native save dialog and writes the theme JSON to the chosen path.
 *
 * Args:
 *   json: The `.tbtheme.json` string to write (from `buildThemeExportPayload`).
 *
 * Returns:
 *   `true` if the file was written, `false` if the user cancelled the dialog.
 *
 * Throws:
 *   Error if the write itself failed (disk full, permission denied, etc.) so
 *   the caller can surface a status message. Cancel (above) returns `false` —
 *   a non-event the caller can ignore.
 */
export async function writeThemeExportFile(json: string): Promise<boolean> {
  return await writeJsonViaSaveDialog("Export theme", "theme.tbtheme.json", json);
}

// ---------------------------------------------------------------------------
// Import.
// ---------------------------------------------------------------------------

/** Result of a theme import operation. */
export interface ImportThemeResult {
  /** The parsed theme name, or null if parsing failed. */
  readonly themeName: string | null;
  /** Diagnostics from parsing (errors and/or warnings). Empty on a clean parse. */
  readonly diagnostics: readonly ThemeDiagnostic[];
}

/**
 * Imports a theme from a `.tbtheme.json` file chosen via a native open dialog.
 *
 * Reads the file, parses it with `parseThemeFile`. On success, stages
 * `appearance.themeFile` to the selected path via `stageChange` so the
 * ThemeProvider picks it up and applies the overrides. The path is STAGED, not
 * saved — the user reviews and clicks Save in the settings tab, matching the
 * settings import pattern.
 *
 * On parse failure, returns the diagnostics so the UI can surface them and does
 * NOT stage anything. Returns `null` if the user cancelled the dialog. Throws if
 * the file couldn't be read (fail-loud: an unreadable file is a distinct,
 * surfaceable failure from a parseable-but-invalid one or a user cancel).
 *
 * Returns:
 *   The {@link ImportThemeResult} with the theme name and diagnostics, or
 *   `null` if the user cancelled the dialog. Throws on read failure.
 */
export async function importTheme(): Promise<ImportThemeResult | null> {
  // Filter to `.tbtheme.json` files so the dialog only shows theme files.
  const picked = await readPickedFile("Import theme", ["tbtheme.json"]);
  if (picked === null) return null; // user cancelled

  const { path, contents } = picked;
  const result = parseThemeFile(contents);

  if (result.theme !== null) {
    // Successful parse: stage the file path so ThemeProvider loads it. The path
    // is staged (not saved) so the user can review and Save in the settings tab.
    useSettingsStore.getState().stageChange("appearance.themeFile", path);
  }

  return {
    themeName: result.theme?.name ?? null,
    diagnostics: result.diagnostics
  };
}
