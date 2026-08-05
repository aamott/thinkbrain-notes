- name: Setting controls do not set id, so the row <label htmlFor> association is broken
- file: /media/adam/extex/projects/thinkbrain-notes/apps/desktop/src/settings/controls/ToggleControl.tsx
- lines: ToggleControl.tsx 21-42; TextControl.tsx 14-22; NumberControl.tsx 20-34; SelectControl.tsx 17-30; PathControl.tsx 34-54; SettingsContent.tsx 111
- description: `SettingsContent.SettingRow` renders `<label className="..." htmlFor={definition.key}>` (SettingsContent.tsx line 111), expecting the control to expose an element with `id={definition.key}`. None of the five controls set an `id`:
  - `ToggleControl` renders a `<button role="switch">` with no `id` (line 22).
  - `TextControl` renders an `<input type="text">` with no `id` (line 15).
  - `NumberControl` renders an `<input type="number">` with no `id` (line 21).
  - `SelectControl` renders a `<select>` with no `id` (line 18).
  - `PathControl` renders an `<input type="text">` with no `id` (line 36) plus a Browse button.
  Consequences:
  1. Clicking the visible label text does not focus/activate the control (the `htmlFor`→`id` binding is unresolved).
  2. Screen readers announce the control without an associated accessible name from the label; the control falls back to whatever name it can derive (often none for a switch/text input), so the setting's label is not announced when focus lands on the input.
  3. The `htmlFor` attribute on the `<label>` resolves to nothing, which some validators flag as a broken reference.
  Each control should accept the `definition` (already in `ControlProps`) and set `id={definition.key}` on its primary focusable element. `PathControl` should set it on the text input (the primary field), not the Browse button.
- verification: Read all five control files and SettingsContent.tsx. Confirmed no `id` attribute is set on any focusable element in any control, while SettingsContent emits `htmlFor={definition.key}`. The ControlProps interface (controlRegistry.ts lines 32-41) already passes `definition`, so the key is available.
