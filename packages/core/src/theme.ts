/**
 * Platform-agnostic theme file parser, validator, and serializer.
 *
 * Themes are stored as `.tbtheme.json` files. This module parses, validates,
 * and serializes them, following the same non-throwing diagnostic pattern used
 * in `./settings.ts`.
 *
 * This is a leaf module: it must NOT import React, DOM APIs, Node.js built-ins,
 * or Tauri APIs (per `packages/core/AGENTS.md`). Color value validation is
 * limited to "non-empty string" here; CSS color syntax validation belongs to
 * the desktop layer, which can pull in a CSS parser.
 */

import { getErrorMessage, isRecord } from "./settings/internal";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/** A custom theme commits to one of these base palettes (no "system"). */
export type ThemeBase = "light" | "dark";

/** Severity of a theme diagnostic, mirroring `SettingsDiagnosticSeverity`. */
export type ThemeDiagnosticSeverity = "error" | "warning";

/** A single validation issue produced while parsing a theme file. */
export interface ThemeDiagnostic {
  readonly code: string;
  readonly message: string;
  readonly severity: ThemeDiagnosticSeverity;
  readonly path?: string;
}

/** A parsed, structurally-valid `.tbtheme.json` document. */
export interface ThemeFile {
  readonly name: string;
  readonly base: ThemeBase;
  readonly version: number;
  readonly tokens: Readonly<Record<string, string>>;
}

/** Result of parsing a raw theme JSON string. */
export interface ParseThemeResult {
  readonly theme: ThemeFile | null;
  readonly diagnostics: readonly ThemeDiagnostic[];
}

// ---------------------------------------------------------------------------
// Known tokens
// ---------------------------------------------------------------------------

// Cross-referenced from packages/ui/src/styles/tokens.css. Update both when
// tokens change.
export const KNOWN_THEME_TOKENS: readonly string[] = [
  "--tn-color-background",
  "--tn-color-foreground",
  "--tn-color-surface",
  "--tn-color-surface-foreground",
  "--tn-color-card",
  "--tn-color-card-foreground",
  "--tn-color-popover",
  "--tn-color-popover-foreground",
  "--tn-color-primary",
  "--tn-color-primary-foreground",
  "--tn-color-secondary",
  "--tn-color-secondary-foreground",
  "--tn-color-muted",
  "--tn-color-muted-foreground",
  "--tn-color-accent",
  "--tn-color-accent-foreground",
  "--tn-color-danger",
  "--tn-color-danger-foreground",
  "--tn-color-destructive",
  "--tn-color-destructive-foreground",
  "--tn-color-success",
  "--tn-color-warning",
  "--tn-color-info",
  "--tn-color-border",
  "--tn-color-input",
  "--tn-color-ring",
  "--tn-color-overlay",
  "--tn-color-titlebar",
  "--tn-color-titlebar-foreground",
  "--tn-color-activitybar",
  "--tn-color-activitybar-foreground",
  "--tn-color-activitybar-active",
  "--tn-color-sidebar",
  "--tn-color-sidebar-foreground",
  "--tn-color-editor",
  "--tn-color-editor-foreground",
  "--tn-color-panel",
  "--tn-color-panel-foreground",
  "--tn-color-statusbar",
  "--tn-color-statusbar-foreground",
  "--tn-color-tab-active",
  "--tn-color-tab-inactive",
  "--tn-color-tab-active-foreground",
  "--tn-color-tab-inactive-foreground"
];

/** Set form of {@link KNOWN_THEME_TOKENS} for O(1) membership checks. */
const KNOWN_TOKEN_SET: ReadonlySet<string> = new Set(KNOWN_THEME_TOKENS);

/** Valid base palette values for a custom theme. */
const THEME_BASES: ReadonlySet<ThemeBase> = new Set<ThemeBase>(["light", "dark"]);

/** All token keys must be namespaced under the ThinkBrain prefix. */
const TOKEN_PREFIX = "--tn-";

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

/**
 * Parses a raw `.tbtheme.json` string into a validated theme document.
 *
 * Validation is non-throwing: structural problems (bad JSON, non-object root,
 * or missing/invalid `name`/`base`/`version`) yield `theme: null` plus error
 * diagnostics. Per-token problems yield diagnostics but the theme is still
 * returned with the surviving valid tokens.
 *
 * Args:
 *   rawJson: Raw JSON text read from a `.tbtheme.json` file.
 *
 * Returns:
 *   The parsed theme (or null if structurally broken) plus diagnostics.
 */
export function parseThemeFile(rawJson: string): ParseThemeResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawJson) as unknown;
  } catch (error) {
    return {
      theme: null,
      diagnostics: [
        {
          code: "theme.invalid_json",
          message: `Theme JSON could not be parsed: ${getErrorMessage(error)}`,
          severity: "error"
        }
      ]
    };
  }

  if (!isRecord(parsed)) {
    return {
      theme: null,
      diagnostics: [
        {
          code: "theme.invalid_shape",
          message: "Theme file must be a JSON object.",
          severity: "error"
        }
      ]
    };
  }

  // Required scalar fields. If any of these are missing/invalid, the file is
  // fundamentally broken and we return null rather than a half-built theme.
  const name = readName(parsed);
  if (name === null) {
    return {
      theme: null,
      diagnostics: [
        {
          code: "theme.name.missing",
          message: "Theme `name` is required and must be a non-empty string.",
          severity: "error",
          path: "name"
        }
      ]
    };
  }

  const base = readBase(parsed);
  if (base === null) {
    return {
      theme: null,
      diagnostics: [
        {
          code: "theme.base.invalid",
          message:
            "Theme `base` is required and must be \"light\" or \"dark\" (custom themes cannot use \"system\").",
          severity: "error",
          path: "base"
        }
      ]
    };
  }

  const version = readVersion(parsed);
  if (version === null) {
    return {
      theme: null,
      diagnostics: [
        {
          code: "theme.version.invalid",
          message: "Theme `version` is required and must be a non-negative integer.",
          severity: "error",
          path: "version"
        }
      ]
    };
  }

  // Tokens are optional. Validate each entry and collect diagnostics.
  const tokens = readTokens(parsed.tokens);
  return {
    theme: { name, base, version, tokens: tokens.tokens },
    diagnostics: tokens.diagnostics
  };
}

/**
 * Reads and validates the required `name` field.
 *
 * Returns the trimmed name, or null if missing/empty/not a string.
 */
function readName(record: Readonly<Record<string, unknown>>): string | null {
  const value = record.name;
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Reads and validates the required `base` field.
 *
 * Returns the base, or null if missing/invalid. "system" is explicitly rejected
 * because a custom theme commits to a concrete palette.
 */
function readBase(record: Readonly<Record<string, unknown>>): ThemeBase | null {
  const value = record.base;
  if (typeof value !== "string") {
    return null;
  }
  return THEME_BASES.has(value as ThemeBase) ? (value as ThemeBase) : null;
}

/**
 * Reads and validates the required `version` field.
 *
 * Returns the version, or null if missing/non-finite/negative/non-integer.
 */
function readVersion(record: Readonly<Record<string, unknown>>): number | null {
  const value = record.version;
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }
  if (!Number.isInteger(value) || value < 0) {
    return null;
  }
  return value;
}

/**
 * Reads and validates the optional `tokens` map.
 *
 * Each key must start with `--tn-`. Keys outside the known token list produce a
 * warning (and are dropped). Keys not starting with `--tn-`, non-string values,
 * or empty-string values produce errors (and are dropped). Valid entries are
 * kept in insertion order.
 *
 * Args:
 *   value: The raw `tokens` value from the parsed JSON (may be any type).
 *
 * Returns:
 *   The surviving valid tokens plus diagnostics for every rejected entry.
 */
function readTokens(value: unknown): {
  readonly tokens: Record<string, string>;
  readonly diagnostics: ThemeDiagnostic[];
} {
  const diagnostics: ThemeDiagnostic[] = [];

  // tokens is optional; absent is fine.
  if (value === undefined) {
    return { tokens: {}, diagnostics };
  }

  if (!isRecord(value)) {
    diagnostics.push({
      code: "theme.tokens.invalid_shape",
      message: "Theme `tokens` must be an object; all tokens were ignored.",
      severity: "error",
      path: "tokens"
    });
    return { tokens: {}, diagnostics };
  }

  const tokens: Record<string, string> = {};
  for (const [key, rawValue] of Object.entries(value)) {
    // Key namespace check: anything outside --tn-* is a hard error.
    if (!key.startsWith(TOKEN_PREFIX)) {
      diagnostics.push({
        code: "theme.token.unknown_namespace",
        message: `Token key "${key}" must start with "--tn-"; token was dropped.`,
        severity: "error",
        path: `tokens.${key}`
      });
      continue;
    }

    // Known-token check: --tn-* but not in the canonical list is a warning.
    // We still drop it so the serialized theme only carries recognized tokens.
    if (!KNOWN_TOKEN_SET.has(key)) {
      diagnostics.push({
        code: "theme.token.unknown",
        message: `Token "${key}" is not a recognized theme token; token was dropped.`,
        severity: "warning",
        path: `tokens.${key}`
      });
      continue;
    }

    // Value must be a non-empty string. CSS color parsing is intentionally not
    // done here (core is platform-agnostic); the desktop layer can validate
    // color syntax if desired.
    if (typeof rawValue !== "string") {
      diagnostics.push({
        code: "theme.token.value_not_string",
        message: `Token "${key}" value must be a string; token was dropped.`,
        severity: "error",
        path: `tokens.${key}`
      });
      continue;
    }

    if (rawValue.length === 0) {
      diagnostics.push({
        code: "theme.token.value_empty",
        message: `Token "${key}" value must not be empty; token was dropped.`,
        severity: "error",
        path: `tokens.${key}`
      });
      continue;
    }

    tokens[key] = rawValue;
  }

  return { tokens, diagnostics };
}

// ---------------------------------------------------------------------------
// Serialization
// ---------------------------------------------------------------------------

/**
 * Serializes a theme document as stable, pretty-printed JSON.
 *
 * The output uses 2-space indentation and a trailing newline, matching the
 * style of `serializeAppSettings`. Key order is `name`, `base`, `version`,
 * `tokens` for deterministic diffs.
 *
 * Args:
 *   theme: The theme document to serialize.
 *
 * Returns:
 *   Canonical JSON string ending with a newline.
 */
export function serializeThemeFile(theme: ThemeFile): string {
  const ordered: Record<string, unknown> = {
    name: theme.name,
    base: theme.base,
    version: theme.version,
    tokens: { ...theme.tokens }
  };
  return `${JSON.stringify(ordered, null, 2)}\n`;
}
