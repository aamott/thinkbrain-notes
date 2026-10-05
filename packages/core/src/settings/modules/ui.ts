/**
 * Built-in UI module.
 *
 * App-scoped interface preferences control desktop chrome and mobile navigation
 * independently of whichever vault is open.
 */

import type { SettingsModule } from "../types";
import { integerValidator, optionalJsonListValidator } from "../internal";

export const uiModule: SettingsModule = {
  id: "ui",
  label: "Interface",
  scope: "app",
  sections: [
    {
      id: "ui.general",
      label: "Size",
      settings: [
        {
          // Percentage applied to the root font size — rem-based chrome and
          // text scale together while px hairlines stay fixed. The editor's
          // own font size (editor.fontSize) stays independent on purpose.
          key: "scale",
          type: "number",
          min: 50,
          max: 200,
          default: 100,
          scope: "app",
          section: "ui.general",
          label: "Interface size",
          description:
            "Interface size in percent; 100 is standard. Ctrl+= zooms in, Ctrl+- zooms out, Ctrl+0 resets. Editor font size is separate.",
          validation: integerValidator("Interface size", "a whole number")
        }
      ]
    },
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
        },
        {
          key: "pinnedActionItems",
          // A string carrying JSON — `SettingType` has
          // no list member. Empty means "use the built-in defaults", which
          // live in the desktop layer so panel ids stay out of core.
          type: "string",
          default: "",
          scope: "app",
          section: "ui.desktop",
          label: "Pinned action items",
          description:
            "Action items pinned to the title bar; the rest sit in the ⋯ menu. Right-click an icon to change. Leave empty to use the defaults.",
          validation: optionalJsonListValidator("Pinned action items", "a JSON list")
        }
      ]
    },
    {
      id: "ui.mobile",
      label: "Mobile",
      settings: [
        {
          key: "mobileBubbleLabels",
          type: "boolean",
          default: false,
          scope: "app",
          section: "ui.mobile",
          label: "Show labels on floating buttons",
          description:
            "Show text next to the Home, New note and Actions buttons on phones."
        }
      ]
    }
  ]
};
