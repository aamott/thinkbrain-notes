/**
 * Built-in Settings module (settings about settings).
 *
 * Holds meta-settings that control the behavior of the settings UI itself, such
 * as the optional autosave mode. Scope is `"app"` since the preference applies
 * globally across workspaces.
 */

import type { SettingsModule } from "../types";

/**
 * The Settings module: preferences about the settings system itself.
 *
 * The `autosave` setting defaults to `false` so the legacy single-Save behavior
 * is preserved unless the user explicitly opts in. When enabled, the desktop
 * store triggers a debounced `saveSettings()` after each `stageChange` instead
 * of waiting for an explicit Save click.
 *
 * The `showAdvanced` setting lives here rather than in `appearance` because it
 * changes what the settings screen shows, not how the app looks. It hides rows
 * without disabling them, and `SettingsContent` reveals an advanced row anyway
 * when a search lands on it or when its value is no longer the default — so
 * turning this off cannot strand a setting somebody already changed.
 */
export const settingsModule: SettingsModule = {
  id: "settings",
  label: "Settings",
  scope: "app",
  sections: [
    {
      id: "settings.general",
      label: "Settings",
      settings: [
        {
          key: "autosave",
          type: "boolean",
          default: false,
          scope: "app",
          section: "settings.general",
          label: "Autosave changes",
          description:
            "Automatically save setting changes without clicking Save."
        },
        {
          key: "showAdvanced",
          type: "boolean",
          default: false,
          scope: "app",
          section: "settings.general",
          label: "Show advanced settings",
          description:
            "Show every setting, including the ones most people never need to change. Advanced settings you have already changed stay visible whether this is on or off."
        }
      ]
    }
  ]
};
