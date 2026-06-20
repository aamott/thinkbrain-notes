import { Button } from "@thinkbrain/ui";
import type { AppSettings } from "@thinkbrain/core";
import type { FormEvent } from "react";

import { useAppStore } from "../stores/appStore";
import { saveAppSettings } from "./settingsService";

const MIN_FONT_SIZE = 10;
const MAX_FONT_SIZE = 32;

export function SettingsPanel() {
  const settingsState = useAppStore((state) => state.settings);
  const updateSettingsDraft = useAppStore((state) => state.updateSettingsDraft);
  const saveSettings = useAppStore((state) => state.saveSettings);
  const isSaving = settingsState.status === "saving";
  const fontSizeInvalid =
    !Number.isInteger(settingsState.draft.editor.fontSize) ||
    settingsState.draft.editor.fontSize < MIN_FONT_SIZE ||
    settingsState.draft.editor.fontSize > MAX_FONT_SIZE;
  const isDirty = !settingsEqual(settingsState.settings, settingsState.draft);
  const canSave = isDirty && !isSaving && !fontSizeInvalid;

  function updateDraft(nextSettings: AppSettings): void {
    updateSettingsDraft(nextSettings);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();

    if (!canSave) {
      return;
    }

    void saveSettings(saveAppSettings);
  }

  return (
    <aside className="settings-panel" aria-labelledby="settings-title">
      <div className="settings-panel__header">
        <p className="app-eyebrow">Settings</p>
        <h2 id="settings-title">Preferences</h2>
      </div>

      <form className="settings-form" onSubmit={handleSubmit}>
        <fieldset className="settings-form__group" disabled={isSaving}>
          <legend>Appearance</legend>
          <label className="settings-field">
            <span>Theme</span>
            <select
              value={settingsState.draft.theme}
              onChange={(event) =>
                updateDraft({
                  ...settingsState.draft,
                  theme: event.target.value as AppSettings["theme"]
                })
              }
            >
              <option value="system">System</option>
              <option value="light">Light</option>
              <option value="dark">Dark</option>
            </select>
          </label>
        </fieldset>

        <fieldset className="settings-form__group" disabled={isSaving}>
          <legend>Editor</legend>
          <label className="settings-field">
            <span>Font size</span>
            <input
              aria-describedby="settings-font-size-help"
              max={MAX_FONT_SIZE}
              min={MIN_FONT_SIZE}
              onChange={(event) =>
                updateDraft({
                  ...settingsState.draft,
                  editor: {
                    ...settingsState.draft.editor,
                    fontSize: event.target.valueAsNumber
                  }
                })
              }
              type="number"
              value={
                Number.isFinite(settingsState.draft.editor.fontSize)
                  ? settingsState.draft.editor.fontSize
                  : ""
              }
            />
          </label>
          <p id="settings-font-size-help" className="settings-help">
            Choose an editor font size from {MIN_FONT_SIZE} to {MAX_FONT_SIZE}px.
          </p>
          {fontSizeInvalid ? (
            <p className="settings-error" role="alert">
              Font size must be between {MIN_FONT_SIZE} and {MAX_FONT_SIZE}px.
            </p>
          ) : null}
          <label className="settings-checkbox">
            <input
              checked={settingsState.draft.editor.lineWrapping}
              onChange={(event) =>
                updateDraft({
                  ...settingsState.draft,
                  editor: {
                    ...settingsState.draft.editor,
                    lineWrapping: event.target.checked
                  }
                })
              }
              type="checkbox"
            />
            <span>Wrap long lines in the editor</span>
          </label>
        </fieldset>

        {settingsState.diagnostics.length > 0 ? (
          <div className="settings-diagnostics" role="status">
            <strong>Settings diagnostics</strong>
            <ul>
              {settingsState.diagnostics.map((diagnostic) => (
                <li key={`${diagnostic.code}-${diagnostic.path ?? "root"}`}>
                  {diagnostic.message}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {settingsState.error ? (
          <div className="workspace-error" role="alert">
            <strong>{settingsState.error.code}</strong>
            <span>{settingsState.error.message}</span>
          </div>
        ) : null}

        <div className="settings-form__actions">
          <span className="settings-status" role="status">
            {settingsStatusText(settingsState.status, isDirty)}
          </span>
          <Button disabled={!canSave} type="submit">
            {isSaving ? "Saving..." : "Save settings"}
          </Button>
        </div>
      </form>
    </aside>
  );
}

function settingsEqual(left: AppSettings, right: AppSettings): boolean {
  return (
    left.theme === right.theme &&
    left.editor.fontSize === right.editor.fontSize &&
    left.editor.lineWrapping === right.editor.lineWrapping
  );
}

function settingsStatusText(status: string, isDirty: boolean): string {
  if (status === "loading") {
    return "Loading settings...";
  }

  if (status === "saving") {
    return "Saving settings...";
  }

  if (status === "error") {
    return isDirty ? "Error, unsaved changes" : "Error";
  }

  return isDirty ? "Unsaved changes" : "Saved";
}
