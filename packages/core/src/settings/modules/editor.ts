/**
 * Built-in Editor settings module.
 *
 * Migrates the legacy fixed-shape `editor.fontSize` and `editor.lineWrapping`
 * settings into the registry-based system. Scope is `"app"` for now; workspace-
 * scoped editor defaults are a follow-up.
 */

import type { SettingsModule } from "../types";

export const editorModule: SettingsModule = {
  id: "editor",
  label: "Editor",
  scope: "app",
  sections: [
    {
      id: "editor.display",
      label: "Display",
      settings: [
        {
          key: "fontSize",
          type: "number",
          min: 10,
          max: 32,
          default: 16,
          scope: "app",
          section: "editor.display",
          label: "Font size",
          description: "Editor font size in pixels.",
          validation: (value) =>
            typeof value === "number" &&
            Number.isInteger(value) &&
            value >= 10 &&
            value <= 32
              ? null
              : "Font size must be an integer between 10 and 32."
        },
        {
          key: "lineWrapping",
          type: "boolean",
          default: true,
          scope: "app",
          section: "editor.display",
          label: "Line wrapping",
          description:
            "Wrap long lines instead of horizontal scrolling."
        }
      ]
    }
  ]
};
