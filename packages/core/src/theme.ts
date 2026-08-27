/**
 * Platform-agnostic theme file parser, validator, and serializer.
 *
 * Themes are stored as `.tbtheme.json` files. This module parses, validates,
 * and serializes them, following the same non-throwing diagnostic pattern used
 * in `./settings.ts`.
 *
 * This is a leaf module: it must NOT import React, DOM APIs, Node.js built-ins,
 * or Tauri APIs (per `packages/core/AGENTS.md`). Whether a value is a
 * *legitimate CSS color* (hex, `rgb()`, `oklch()`, a named color, ...) is
 * still not judged here — that requires real color-syntax knowledge and, per
 * the theme-foundation plan, is left to a desktop-layer parser if one is ever
 * added. What IS validated here is a narrower, platform-agnostic property:
 * token values are interpolated verbatim into a CSS declaration by the
 * desktop layer's `themeInjection.ts` (`${token}: ${value};`), so a value
 * carrying `;`, `{`, `}`, `@`, or a CSS comment can break out of that
 * declaration and inject arbitrary rules. That is a string-safety check, not
 * a color parse, and it must happen wherever the diagnostics channel already
 * lives — here — because the desktop layer has no diagnostics channel of its
 * own to report through; see `readTokens` below.
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
  "--tn-color-hub",
  "--tn-color-hub-foreground",
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

/**
 * Current `.tbtheme.json` schema version. No consumer branches on `version`
 * yet (there is exactly one schema shape), so this is used only as the
 * default for files that omit the field — see `readVersion`.
 */
const CURRENT_THEME_VERSION = 1;

/**
 * Matches characters/sequences that let a token value escape the single CSS
 * declaration it's interpolated into (`${token}: ${value};` in
 * `themeInjection.ts`). No legitimate single-value color needs `;`, `{`,
 * `}`, `@`, or a comment opener — hex, `rgb()`, `oklch()`, `color-mix(...)`,
 * `var(--x)`, and named colors are all untouched by this check.
 */
const UNSAFE_VALUE_PATTERN = /[;{}@]|\/\*/;

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

/** Builds a `theme: null` result with a single structural-failure error diagnostic. */
const structuralFailure = (code: string, message: string, path: string): ParseThemeResult => ({
  theme: null,
  diagnostics: [{ code, message, severity: "error", path }]
});

/** Pushes a per-token diagnostic keyed under `tokens.<key>`. */
const tokenDiagnostic = (
  diagnostics: ThemeDiagnostic[],
  key: string,
  code: string,
  message: string,
  severity: ThemeDiagnosticSeverity
): void => {
  diagnostics.push({ code, message, severity, path: `tokens.${key}` });
};

/**
 * Parses a raw `.tbtheme.json` string into a validated theme document.
 *
 * Validation is non-throwing: structural problems (bad JSON, non-object root,
 * missing/invalid `name`/`base`, or a `version` that is present but
 * malformed) yield `theme: null` plus error diagnostics. `version` itself is
 * optional — see `readVersion`. Per-token problems yield diagnostics but the
 * theme is still returned with the surviving valid tokens.
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
    return structuralFailure(
      "theme.name.missing",
      "Theme `name` is required and must be a non-empty string.",
      "name"
    );
  }

  const base = readBase(parsed);
  if (base === null) {
    return structuralFailure(
      "theme.base.invalid",
      "Theme `base` is required and must be \"light\" or \"dark\" (custom themes cannot use \"system\").",
      "base"
    );
  }

  const version = readVersion(parsed);
  if (version === null) {
    return structuralFailure(
      "theme.version.invalid",
      "Theme `version`, if present, must be a non-negative integer.",
      "version"
    );
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
 * Reads and validates the optional `version` field.
 *
 * No consumer branches on `version` today, so an author who simply omits it
 * should not get a hard parse failure over metadata nothing reads — absence
 * defaults to {@link CURRENT_THEME_VERSION}. The field itself stays in the
 * schema (rather than being dropped) because `.tbtheme.json` is a shareable
 * file format: reserving the slot now means a future schema change has a
 * version to gate on, without asking every existing/omitted file to be
 * rewritten first. A *present* value is still validated strictly — a
 * malformed version (wrong type, negative, fractional) is far more likely a
 * corrupt or hand-edited file than an intentional omission, so that case
 * keeps failing loudly rather than being coerced.
 *
 * Returns the version (defaulting to current when absent), or null if present
 * but non-finite/negative/non-integer.
 */
function readVersion(record: Readonly<Record<string, unknown>>): number | null {
  const value = record.version;
  if (value === undefined) {
    return CURRENT_THEME_VERSION;
  }
  if (typeof value !== "number" || !Number.isFinite(value) || !Number.isInteger(value) || value < 0) {
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
      tokenDiagnostic(
        diagnostics,
        key,
        "theme.token.unknown_namespace",
        `Token key "${key}" must start with "--tn-"; token was dropped.`,
        "error"
      );
      continue;
    }

    // Known-token check: --tn-* but not in the canonical list is a warning.
    // We still drop it so the serialized theme only carries recognized tokens.
    if (!KNOWN_TOKEN_SET.has(key)) {
      tokenDiagnostic(
        diagnostics,
        key,
        "theme.token.unknown",
        `Token "${key}" is not a recognized theme token; token was dropped.`,
        "warning"
      );
      continue;
    }

    // Value must be a non-empty string. Whether it's a *legitimate CSS
    // color* is intentionally not judged here (core is platform-agnostic);
    // the desktop layer can add real color-syntax validation if desired.
    if (typeof rawValue !== "string") {
      tokenDiagnostic(
        diagnostics,
        key,
        "theme.token.value_not_string",
        `Token "${key}" value must be a string; token was dropped.`,
        "error"
      );
      continue;
    }

    if (rawValue.length === 0) {
      tokenDiagnostic(
        diagnostics,
        key,
        "theme.token.value_empty",
        `Token "${key}" value must not be empty; token was dropped.`,
        "error"
      );
      continue;
    }

    // Unlike color-syntax validation, this check IS a core concern: the
    // desktop layer interpolates the value verbatim into a CSS declaration
    // (`themeInjection.ts`), so a value carrying `;`, `{`, `}`, `@`, or a
    // comment opener can break out of that declaration and inject arbitrary
    // CSS. Rejecting it here — where the diagnostics channel already exists —
    // is the only place that can report the rejection back to the user; the
    // desktop layer has no diagnostics channel of its own.
    if (UNSAFE_VALUE_PATTERN.test(rawValue)) {
      tokenDiagnostic(
        diagnostics,
        key,
        "theme.token.value_unsafe",
        `Token "${key}" value contains characters that could break out of ` +
          'its CSS declaration (";", "{", "}", "@", or a comment); token was dropped.',
        "error"
      );
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
