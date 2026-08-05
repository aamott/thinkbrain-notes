/**
 * Built-in Appearance settings module.
 *
 * Migrates the legacy fixed-shape `theme` setting into the registry-based
 * system. Scope is `"app"` since the theme applies globally across workspaces.
 */

import type { SettingsModule } from "../types";

/** Allowed theme values; mirrored from the legacy `AppThemeSetting`. */
const THEME_OPTIONS = ["system", "light", "dark"] as const;

/**
 * The Appearance module: application color theme.
 *
 * The `validation` function is belt-and-suspenders on top of the registry's
 * built-in enum check — it keeps the module self-documenting and resilient if
 * the enum check is ever relaxed.
 */
export const appearanceModule: SettingsModule = {
  id: "appearance",
  label: "Appearance",
  scope: "app",
  sections: [
    {
      id: "appearance.theme",
      label: "Theme",
      settings: [
        {
          key: "theme",
          type: "enum",
          options: THEME_OPTIONS,
          default: "system",
          scope: "app",
          section: "appearance.theme",
          label: "Theme",
          description:
            "Application color theme. System follows your OS preference.",
          validation: (value) =>
            typeof value === "string" && THEME_OPTIONS.includes(value as never)
              ? null
              : `Theme must be one of: ${THEME_OPTIONS.join(", ")}.`
        }
      ]
    }
  ]
};
