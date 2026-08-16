// Dynamic settings persistence functions live in ./settings/dynamic.ts to keep
// this file under 500 lines. They are re-exported here so the public API stays
// unchanged (consumers import from "@thinkbrain/core" which sources from here).
export {
  parseDynamicAppSettings,
  serializeDynamicSettings,
  serializeDynamicAppSettings,
  type ParseDynamicAppSettingsResult
} from "./settings/dynamic";

// `CURRENT_SETTINGS_VERSION` lives in `./settings/internal` (a leaf module) so
// that `./settings/dynamic.ts` can import it without creating a runtime cycle
// back through this file. It is imported here for local use and re-exported
// for backward compatibility with consumers that import it from
// "@thinkbrain/core" via this module.
import {
  CURRENT_SETTINGS_VERSION,
  getErrorMessage,
  isRecord,
  readSettingsVersion
} from "./settings/internal";
export { CURRENT_SETTINGS_VERSION };

// Shared helpers (`isRecord`, `getErrorMessage`) are also sourced from the
// `./settings/internal` leaf module to eliminate duplication.

export type SettingsDiagnosticSeverity = "error" | "warning";

export interface SettingsDiagnostic {
  readonly code: string;
  readonly message: string;
  readonly severity: SettingsDiagnosticSeverity;
  readonly path?: string;
}

export type AppThemeSetting = "system" | "light" | "dark";

export interface EditorSettings {
  readonly fontSize: number;
  readonly lineWrapping: boolean;
}

export interface AppSettings {
  readonly version: typeof CURRENT_SETTINGS_VERSION;
  readonly theme: AppThemeSetting;
  readonly editor: EditorSettings;
}

export interface ParseSettingsResult {
  readonly settings: AppSettings;
  readonly diagnostics: readonly SettingsDiagnostic[];
}

type MigrationStep = {
  readonly fromVersion: number;
  readonly toVersion: number;
  readonly migrate: (value: Readonly<Record<string, unknown>>) => Record<string, unknown>;
};

const APP_THEMES = new Set<AppThemeSetting>(["system", "light", "dark"]);
const DEFAULT_EDITOR_FONT_SIZE = 16;
const MIN_EDITOR_FONT_SIZE = 10;
const MAX_EDITOR_FONT_SIZE = 32;

export const DEFAULT_APP_SETTINGS: AppSettings = Object.freeze({
  version: CURRENT_SETTINGS_VERSION,
  theme: "system",
  editor: Object.freeze({
    fontSize: DEFAULT_EDITOR_FONT_SIZE,
    lineWrapping: true
  })
});

const APP_SETTING_MIGRATIONS: readonly MigrationStep[] = [
  {
    fromVersion: 0,
    toVersion: 1,
    migrate: (value) => ({
      version: 1,
      theme: value.theme,
      editor: {
        fontSize: value.fontSize,
        lineWrapping: value.lineWrapping
      }
    })
  }
];

/**
 * Parses app settings JSON into a validated, current-version settings object.
 *
 * Unknown fields are intentionally ignored during validation and omitted during
 * serialization. The settings file is user-editable JSON, but the app owns the
 * canonical schema so stale or misspelled keys do not become persisted API.
 *
 * Args:
 *   rawJson: Raw JSON read from the native settings command, or null if absent.
 *
 * Returns:
 *   Current app settings plus non-throwing diagnostics for any fallback taken.
 */
export function parseAppSettings(rawJson: string | null): ParseSettingsResult {
  if (rawJson === null) {
    return {
      settings: DEFAULT_APP_SETTINGS,
      diagnostics: [
        {
          code: "settings.missing",
          message: "Application settings file was not found; defaults were used.",
          severity: "warning"
        }
      ]
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawJson) as unknown;
  } catch (error) {
    return {
      settings: DEFAULT_APP_SETTINGS,
      diagnostics: [
        {
          code: "settings.invalid_json",
          message: `Application settings JSON could not be parsed: ${getErrorMessage(error)}`,
          severity: "error"
        }
      ]
    };
  }

  if (!isRecord(parsed)) {
    return {
      settings: DEFAULT_APP_SETTINGS,
      diagnostics: [
        {
          code: "settings.invalid_shape",
          message: "Application settings must be a JSON object; defaults were used.",
          severity: "error"
        }
      ]
    };
  }

  const versionResult = readSettingsVersion(parsed);
  if (versionResult.diagnostic) {
    return {
      settings: DEFAULT_APP_SETTINGS,
      diagnostics: [versionResult.diagnostic]
    };
  }

  let candidate: Record<string, unknown>;
  try {
    candidate = migrateSettingsObject(parsed, versionResult.version);
  } catch (error) {
    return {
      settings: DEFAULT_APP_SETTINGS,
      diagnostics: [
        {
          code: "settings.migration_failed",
          message: getErrorMessage(error),
          severity: "error"
        }
      ]
    };
  }

  return normalizeAppSettings(candidate);
}

function migrateSettingsObject(
  unknownObj: unknown,
  fromVersion: number
): Record<string, unknown> {
  if (!isRecord(unknownObj)) {
    throw new TypeError("Application settings must be a JSON object.");
  }

  if (!Number.isInteger(fromVersion) || fromVersion < 0) {
    throw new RangeError("Application settings version must be a non-negative integer.");
  }

  if (fromVersion > CURRENT_SETTINGS_VERSION) {
    throw new RangeError(
      `Application settings version ${fromVersion} is newer than supported version ${CURRENT_SETTINGS_VERSION}.`
    );
  }

  let value: Record<string, unknown> = { ...unknownObj };
  for (const step of APP_SETTING_MIGRATIONS) {
    if (step.fromVersion < fromVersion) {
      continue;
    }

    if (step.fromVersion !== (typeof value.version === "number" ? value.version : 0)) {
      throw new RangeError(
        `Expected settings version ${step.fromVersion} before migrating to ${step.toVersion}.`
      );
    }

    value = step.migrate(value);
  }

  return value;
}

/**
 * Serializes app settings as stable, pretty JSON.
 *
 * Args:
 *   settings: Current application settings.
 *
 * Returns:
 *   Canonical JSON with known fields ordered consistently.
 */
export function serializeAppSettings(settings: AppSettings): string {
  const normalized = normalizeAppSettings(settings).settings;

  return `${JSON.stringify(
    {
      version: normalized.version,
      theme: normalized.theme,
      editor: {
        fontSize: normalized.editor.fontSize,
        lineWrapping: normalized.editor.lineWrapping
      }
    },
    null,
    2
  )}\n`;
}

function normalizeAppSettings(value: unknown): ParseSettingsResult {
  const diagnostics: SettingsDiagnostic[] = [];
  const record = isRecord(value) ? value : {};
  const editor = isRecord(record.editor) ? record.editor : {};

  const theme = readTheme(record.theme, diagnostics);
  const fontSize = readEditorFontSize(editor.fontSize, diagnostics);
  const lineWrapping = readEditorLineWrapping(editor.lineWrapping, diagnostics);

  if (!isRecord(record.editor)) {
    diagnostics.push({
      code: "settings.editor.invalid",
      message: "Editor settings must be an object; editor defaults were used.",
      severity: "warning",
      path: "editor"
    });
  }

  return {
    settings: {
      version: CURRENT_SETTINGS_VERSION,
      theme,
      editor: {
        fontSize,
        lineWrapping
      }
    },
    diagnostics
  };
}

function readTheme(
  value: unknown,
  diagnostics: SettingsDiagnostic[]
): AppThemeSetting {
  if (typeof value === "string" && APP_THEMES.has(value as AppThemeSetting)) {
    return value as AppThemeSetting;
  }

  if (value !== undefined) {
    diagnostics.push({
      code: "settings.theme.invalid",
      message: "Theme must be one of system, light, or dark; default theme was used.",
      severity: "warning",
      path: "theme"
    });
  }

  return DEFAULT_APP_SETTINGS.theme;
}

function readEditorFontSize(
  value: unknown,
  diagnostics: SettingsDiagnostic[]
): number {
  if (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= MIN_EDITOR_FONT_SIZE &&
    value <= MAX_EDITOR_FONT_SIZE
  ) {
    return value;
  }

  if (value !== undefined) {
    diagnostics.push({
      code: "settings.editor.font_size.invalid",
      message: `Editor font size must be an integer from ${MIN_EDITOR_FONT_SIZE} to ${MAX_EDITOR_FONT_SIZE}; default font size was used.`,
      severity: "warning",
      path: "editor.fontSize"
    });
  }

  return DEFAULT_APP_SETTINGS.editor.fontSize;
}

function readEditorLineWrapping(
  value: unknown,
  diagnostics: SettingsDiagnostic[]
): boolean {
  if (typeof value === "boolean") {
    return value;
  }

  if (value !== undefined) {
    diagnostics.push({
      code: "settings.editor.line_wrapping.invalid",
      message: "Editor line wrapping must be a boolean; default line wrapping was used.",
      severity: "warning",
      path: "editor.lineWrapping"
    });
  }

  return DEFAULT_APP_SETTINGS.editor.lineWrapping;
}
