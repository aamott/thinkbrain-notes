/**
 * Built-in Editor settings module.
 *
 * Scope is `"app"` for now; workspace-scoped editor defaults are a follow-up.
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
          // Range bounds (min/max) are enforced by `checkRange` in
          // validation.ts; the validator here only adds the integer constraint
          // so the bounds stay defined in one place (the definition itself).
          validation: (value) =>
            typeof value === "number" && Number.isInteger(value)
              ? null
              : "Font size must be an integer."
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
        },
        {
          key: "livePreview",
          type: "boolean",
          default: true,
          scope: "app",
          section: "editor.display",
          label: "Live preview",
          description:
            "Render Markdown formatted inline, showing raw syntax only where the cursor is."
        }
      ]
    }
  ]
};
