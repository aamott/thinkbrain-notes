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
        }
      ]
    }
  ]
};
