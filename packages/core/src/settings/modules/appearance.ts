/**
 * Built-in Appearance settings module.
 *
 * Scope is `"app"` since the theme applies globally across workspaces.
 */

import type { SettingsModule } from "../types";

/** Allowed theme values; mirrored from the legacy `AppThemeSetting`. */
const THEME_OPTIONS = ["system", "light", "dark"] as const;

/** Allowed shell mode values for the appearance setting. */
const SHELL_MODE_OPTIONS = ["auto", "phone", "desktop"] as const;

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
          // Belt-and-suspenders on top of the registry's built-in enum check.
          // Cast to the union type only for the membership test; the value is
          // already narrowed to string above, so this is sound.
          validation: (value): string | null => {
            if (typeof value !== "string") {
              return `Theme must be one of: ${THEME_OPTIONS.join(", ")}.`;
            }
            return (THEME_OPTIONS as readonly string[]).includes(value)
              ? null
              : `Theme must be one of: ${THEME_OPTIONS.join(", ")}.`;
          }
        },
        {
          // Optional path to a .tbtheme.json file. When set, the desktop layer
          // parses the file and injects its token overrides on top of the base
          // palette. `portable: false` because absolute paths are machine-
          // specific — the export flow warns the user before bundling them.
          key: "themeFile",
          type: "path",
          default: null,
          scope: "app",
          section: "appearance.theme",
          label: "Custom theme file",
          description:
            "Path to a .tbtheme.json file. Overrides the base theme's color tokens.",
          portable: false
        }
      ]
    },
    {
      id: "appearance.shell",
      label: "Shell layout",
      settings: [
        {
          // Overrides the automatic form-factor detection. "auto" uses the
          // pointer + viewport gate; "phone" and "desktop" force one chrome
          // regardless of device. Useful for testing the phone UI on desktop.
          key: "shellMode",
          type: "enum",
          options: SHELL_MODE_OPTIONS,
          default: "auto",
          scope: "app",
          section: "appearance.shell",
          label: "Interface layout",
          description:
            "Auto detects phone vs desktop from your screen and pointer. Force phone or desktop to preview the other layout.",
          validation: (value): string | null => {
            if (typeof value !== "string") {
              return `Interface layout must be one of: ${SHELL_MODE_OPTIONS.join(", ")}.`;
            }
            return (SHELL_MODE_OPTIONS as readonly string[]).includes(value)
              ? null
              : `Interface layout must be one of: ${SHELL_MODE_OPTIONS.join(", ")}.`;
          }
        }
      ]
    }
  ]
};
