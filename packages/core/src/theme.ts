/**
 * Platform-agnostic theme file parser, validator, and serializer.
 *
 * Themes are stored as `.tbtheme.json` files. This module parses, validates,
 * and serializes them, following the same non-throwing diagnostic pattern used
 * in `./settings.ts`.
 *
 * This is a leaf module: it must NOT import React, DOM APIs, Node.js built-ins,
 * or Tauri APIs (per `packages/core/AGENTS.md`). Color-syntax validation is
 * performed here via a syntax-level check (`isValidCssColorValue`) that
 * verifies values match a recognized CSS color format (hex, named/system
 * colors, or a known color function with balanced parentheses). Function
 * arguments are not parsed — that requires a full CSS value parser and the
 * browser silently drops invalid declarations anyway. Additionally, token
 * values are interpolated verbatim into a CSS declaration by the desktop
 * layer's `themeInjection.ts` (`${token}: ${value};`), so a value carrying
 * `;`, `{`, `}`, `@`, or a CSS comment can break out of that declaration and
 * inject arbitrary rules. That string-safety check also lives here, where the
 * diagnostics channel already exists — the desktop layer has no diagnostics
 * channel of its own to report through; see `readTokens` below.
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
// CSS color validation
// ---------------------------------------------------------------------------

/**
 * CSS named colors (level 4) plus `transparent` and `currentcolor`.
 *
 * Source: https://www.w3.org/TR/css-color-4/#named-colors — the 148 named
 * colors plus the two special keywords. Kept as a set for O(1) lookup.
 */
const CSS_NAMED_COLORS: ReadonlySet<string> = new Set([
  "aliceblue", "antiquewhite", "aqua", "aquamarine", "azure", "beige",
  "bisque", "black", "blanchedalmond", "blue", "blueviolet", "brown",
  "burlywood", "cadetblue", "chartreuse", "chocolate", "coral",
  "cornflowerblue", "cornsilk", "crimson", "cyan", "darkblue", "darkcyan",
  "darkgoldenrod", "darkgray", "darkgreen", "darkgrey", "darkkhaki",
  "darkmagenta", "darkolivegreen", "darkorange", "darkorchid", "darkred",
  "darksalmon", "darkseagreen", "darkslateblue", "darkslategray",
  "darkslategrey", "darkturquoise", "darkviolet", "deeppink", "deepskyblue",
  "dimgray", "dimgrey", "dodgerblue", "firebrick", "floralwhite",
  "forestgreen", "fuchsia", "gainsboro", "ghostwhite", "gold", "goldenrod",
  "gray", "green", "greenyellow", "grey", "honeydew", "hotpink",
  "indianred", "indigo", "ivory", "khaki", "lavender", "lavenderblush",
  "lawngreen", "lemonchiffon", "lightblue", "lightcoral", "lightcyan",
  "lightgoldenrodyellow", "lightgray", "lightgreen", "lightgrey",
  "lightpink", "lightsalmon", "lightseagreen", "lightskyblue",
  "lightslategray", "lightslategrey", "lightsteelblue", "lightyellow",
  "lime", "limegreen", "linen", "magenta", "maroon", "mediumaquamarine",
  "mediumblue", "mediumorchid", "mediumpurple", "mediumseagreen",
  "mediumslateblue", "mediumspringgreen", "mediumturquoise",
  "mediumvioletred", "midnightblue", "mintcream", "mistyrose", "moccasin",
  "navajowhite", "navy", "oldlace", "olive", "olivedrab", "orange",
  "orangered", "orchid", "palegoldenrod", "palegreen", "paleturquoise",
  "palevioletred", "papayawhip", "peachpuff", "peru", "pink", "plum",
  "powderblue", "purple", "rebeccapurple", "red", "rosybrown", "royalblue",
  "saddlebrown", "salmon", "sandybrown", "seagreen", "seashell", "sienna",
  "silver", "skyblue", "slateblue", "slategray", "slategrey", "snow",
  "springgreen", "steelblue", "tan", "teal", "thistle", "tomato",
  "turquoise", "violet", "wheat", "white", "whitesmoke", "yellow",
  "yellowgreen", "transparent", "currentcolor"
]);

/**
 * CSS system color keywords — colors that reference the OS/user-agent UI
 * palette. A theme using these auto-adapts to the OS light/dark preference
 * without the author writing two variants (per theme-foundation design
 * decision #4).
 *
 * Source: https://www.w3.org/TR/css-color-4/#css-system-colors
 */
const CSS_SYSTEM_COLORS: ReadonlySet<string> = new Set([
  "canvas", "canvastext", "linktext", "visitedtext", "activetext",
  "buttonface", "buttontext", "buttonborder", "field", "fieldtext",
  "highlight", "highlighttext", "selecteditem", "selecteditemtext",
  "mark", "marktext", "graytext", "accentcolor", "accentcolortext",
  // Legacy names (CSS Color Module level 3) still accepted by browsers.
  "activeborder", "activecaption", "appworkspace", "background", "buttonhighlight",
  "buttonshadow", "captiontext", "inactiveborder", "inactivecaption",
  "inactivecaptiontext", "infobackground", "infotext", "menu", "menutext",
  "scrollbar", "threeddarkshadow", "threedface", "threedhighlight",
  "threedlightshadow", "threedshadow", "window", "windowframe", "windowtext"
]);

/**
 * CSS color function names that accept a single parenthesized argument list.
 * Each produces a color value. `var()` is included because a theme may
 * reference another token by name; the resolved value is expected to be a
 * color, but validating the reference chain is out of scope.
 */
const CSS_COLOR_FUNCTIONS: ReadonlySet<string> = new Set([
  "rgb", "rgba", "hsl", "hsla", "hwb", "lab", "lch", "oklab", "oklch",
  "color", "color-mix", "color-contrast", "var", "light-dark"
]);

/**
 * Hex color: `#` followed by exactly 3, 4, 6, or 8 hex digits (with optional
 * alpha). Case-insensitive. The alternation ensures exact length matches —
 * `[0-9a-f]{3,4}` would incorrectly accept a 4-char string like `abc1` that
 * is not valid hex of any supported length.
 */
const HEX_COLOR_PATTERN = /^#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;

/**
 * CSS-wide keywords valid on any property, including color properties and
 * custom properties that resolve to colors. A theme author may legitimately
 * want a token to inherit from its parent or reset to the UA default.
 *
 * Source: https://www.w3.org/TR/css-cascade-5/#defaulting-keywords
 */
const CSS_WIDE_KEYWORDS: ReadonlySet<string> = new Set([
  "inherit", "initial", "unset", "revert", "revert-layer"
]);

/**
 * Validates that a string is a plausible CSS color value.
 *
 * This is a syntax-level check, not a full CSS parse — it verifies the value
 * matches one of the recognized color formats (hex, named color, system color,
 * CSS-wide keyword, or a known color function with balanced parentheses). It
 * does NOT parse the arguments inside functional notations (e.g. it won't
 * catch `rgb(300, -5, 0)` as out-of-range), because that requires a full CSS
 * value parser and the browser will silently ignore invalid declarations
 * anyway. The check catches typos and non-color values that would otherwise
 * be silently dropped by the CSS engine, giving the user actionable feedback
 * at import time.
 *
 * Accepted formats (per theme-foundation design decision #4):
 * - Hex: `#rgb`, `#rgba`, `#rrggbb`, `#rrggbbaa`
 * - Named colors: `red`, `cornflowerblue`, `transparent`, `currentcolor`, …
 * - System colors: `Canvas`, `ButtonFace`, `Highlight`, `Field`, …
 * - CSS-wide keywords: `inherit`, `initial`, `unset`, `revert`, `revert-layer`
 * - Functions: `rgb()`, `rgba()`, `hsl()`, `hsla()`, `hwb()`, `lab()`,
 *   `lch()`, `oklab()`, `oklch()`, `color()`, `color-mix()`,
 *   `color-contrast()`, `var()`, `light-dark()`
 *
 * Args:
 *   value: The string to validate (already confirmed non-empty and safe).
 *
 * Returns:
 *   `true` if the value matches a recognized CSS color format.
 */
export function isValidCssColorValue(value: string): boolean {
  const trimmed = value.trim().toLowerCase();

  // Hex colors.
  if (HEX_COLOR_PATTERN.test(trimmed)) return true;

  // Named colors, system colors, and CSS-wide keywords (case-insensitive).
  if (CSS_NAMED_COLORS.has(trimmed)) return true;
  if (CSS_SYSTEM_COLORS.has(trimmed)) return true;
  if (CSS_WIDE_KEYWORDS.has(trimmed)) return true;

  // Functional notations: check the function name is recognized, the value
  // has non-whitespace content inside the parentheses, and parentheses are
  // balanced with the first function closing exactly at the end of the
  // string. The content inside is not parsed — the browser will reject
  // invalid arguments, and a full CSS value parser is out of scope for a
  // platform-agnostic module. The `s` (dotAll) flag is intentional: a
  // JSON-parsed value may contain real newlines between tokens, and CSS
  // permits whitespace including newlines there.
  const funcMatch = /^([a-z-]+)\s*\((.+)\)$/s.exec(trimmed);
  if (funcMatch !== null) {
    const funcName = funcMatch[1]!;
    if (CSS_COLOR_FUNCTIONS.has(funcName)) {
      // Whitespace-only args (e.g. `rgb( )`, `var(\n)`) are invalid — no
      // color function produces a color with zero real arguments.
      if (funcMatch[2]!.trim().length === 0) return false;

      // Verify parentheses are balanced (the unsafe-char check already
      // blocked `;{}@`, so we only need to count parens). The regex
      // guarantees the string ends with `)`, so a single top-level function
      // reaches depth 0 exactly at the last character. Reaching 0 earlier
      // means there is trailing content (e.g. a second concatenated
      // function like `rgb(0 0 0) hsl(0 0 0)`), which is not a valid single
      // color value. Nested functions like
      // `color-mix(in srgb, var(--x) 50%, blue)` reach depth 0 only at
      // their final closing paren, so they still pass.
      let depth = 0;
      for (let i = 0; i < trimmed.length; i++) {
        const ch = trimmed[i]!;
        if (ch === "(") depth++;
        else if (ch === ")") {
          depth--;
          // The regex guarantees the string ends with `)`, so a single
          // top-level function reaches depth 0 exactly at the last
          // character. Reaching 0 earlier means there is trailing content
          // (e.g. a second concatenated function like
          // `rgb(0 0 0) hsl(0 0 0)`), which is not a valid single color
          // value. Nested functions like
          // `color-mix(in srgb, var(--x) 50%, blue)` reach depth 0 only at
          // their final closing paren, so they still pass.
          if (depth < 0) return false;
          if (depth === 0 && i < trimmed.length - 1) return false;
        }
      }
      return depth === 0;
    }
  }

  return false;
}

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

    // Value must be a non-empty string. Color-syntax validity is checked
    // below via `isValidCssColorValue` — a syntax-level check that covers
    // hex, named/system colors, and recognized color functions.
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

    // Strict CSS color validation: the value must match a recognized color
    // format (hex, named color, system color, or a known color function
    // with balanced parentheses). This catches typos and non-color values
    // at import time, giving the user actionable feedback. Function
    // arguments are not parsed (e.g. `rgb(300, -5, 0)` passes) — the
    // browser silently drops invalid declarations, and a full CSS value
    // parser is out of scope for a platform-agnostic module with zero
    // dependencies.
    if (!isValidCssColorValue(rawValue)) {
      tokenDiagnostic(
        diagnostics,
        key,
        "theme.token.value_not_color",
        `Token "${key}" value "${rawValue}" is not a recognized CSS color; token was dropped.`,
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
