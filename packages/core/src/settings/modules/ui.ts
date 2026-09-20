/**
 * Built-in UI module.
 *
 * App-scoped interface preferences control desktop chrome and mobile navigation
 * independently of whichever vault is open.
 */

import type { SettingsModule } from "../types";

/** Control key for the hub editor rendered by the desktop layer. */
export const MOBILE_HUB_CONTROL = "mobile-hub-items";

export const uiModule: SettingsModule = {
  id: "ui",
  label: "Interface",
  scope: "app",
  sections: [
    {
      id: "ui.desktop",
      label: "Desktop",
      settings: [
        {
          key: "workspaceSelectorPlacement",
          type: "enum",
          options: ["title bar", "panel headers"],
          default: "title bar",
          scope: "app",
          section: "ui.desktop",
          label: "Workspace selector location",
          description: "Show the workspace selector in the title bar or above eligible left panels."
        }
      ]
    },
    {
      id: "ui.mobile",
      label: "Mobile",
      settings: [
        {
          key: "mobileHub",
          // `SettingType` has no list or JSON member and this work does not add
          // one — that would touch validation, import/export, the control
          // registry and settings search. Same shape as journal.fieldDefinitions.
          type: "string",
          // Empty means "use the built-in defaults", which live in the desktop
          // layer so panel and command ids stay out of platform-agnostic core.
          default: "",
          scope: "app",
          section: "ui.mobile",
          control: MOBILE_HUB_CONTROL,
          label: "Bottom bar shortcuts",
          description:
            "Shortcuts shown in the bottom bar on phones. Leave empty to use the defaults.",
          validation: (value): string | null => {
            if (typeof value !== "string") return "Bottom bar shortcuts must be text.";
            if (value.trim().length === 0) return null;
            try {
              return Array.isArray(JSON.parse(value))
                ? null
                : "Bottom bar shortcuts must be a list.";
            } catch {
              return "Bottom bar shortcuts must be valid JSON.";
            }
          }
        }
      ]
    }
  ]
};
