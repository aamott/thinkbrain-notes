/**
 * Git destination plus sign-in details.
 *
 * The link remains an ordinary workspace setting. Username and token never
 * join it: they cross the native bridge once and go straight to the OS
 * keychain.
 */

import { useEffect, useState } from "react";

import { NativeCommandError } from "../../native/commands";
import { saveSyncCredentials } from "../../sync/syncService";
import { useSettingsStore } from "../settingsStore";
import { inputClassName, type ControlProps } from "../controlRegistry";

export function GitLinkControl({ definition, value, onChange, disabled }: ControlProps) {
  const [username, setUsername] = useState("");
  const [token, setToken] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const rootPath = useSettingsStore((state) => state.workspaceRootPath);
  const saveSettings = useSettingsStore((state) => state.saveSettings);
  const rawDestination = typeof value === "string" ? value : "";
  const destination = redactCredentials(rawDestination);
  const legacyNotice =
    destination !== rawDestination
      ? "A username or token was removed from this link. Save settings to finish clearing it."
      : null;
  const validation = definition.validation?.(destination) ?? null;
  const isHttps = destination.trim().startsWith("https://");
  const canSave =
    !disabled &&
    !saving &&
    rootPath !== null &&
    validation === null &&
    isHttps &&
    username.trim() !== "" &&
    token !== "";

  // Older builds accepted a token in the link. Never render it again; stage
  // the redacted link so the next Settings save clears it from disk.
  useEffect(() => {
    if (destination === rawDestination) return;
    onChange(destination);
  }, [destination, onChange, rawDestination]);

  const save = async (): Promise<void> => {
    if (!canSave || rootPath === null) return;
    setSaving(true);
    setNotice(null);
    try {
      const saved = await saveSettings();
      if (!saved.success) {
        setNotice("Fix the highlighted settings before saving this sign-in.");
        return;
      }
      await saveSyncCredentials(rootPath, destination.trim(), username.trim(), token);
      setToken("");
      setNotice("Git link and sign-in saved. This git link was checked.");
    } catch (error) {
      setNotice(
        error instanceof NativeCommandError
          ? error.message
          : "Could not save this sign-in. Check the git link and try again."
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex w-full max-w-lg flex-col gap-3">
      <input
        type="url"
        id={definition.key}
        value={destination}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        placeholder="https://github.com/you/notes.git"
        aria-describedby={`${definition.key}-help`}
        className={`w-full ${inputClassName}`}
      />
      <p id={`${definition.key}-help`} className="m-0 text-xs leading-relaxed text-muted-foreground">
        Use an HTTPS link to sign in below. Folder and SSH links do not use a username or token.
      </p>
      {rootPath === null && (
        <p role="alert" className="m-0 text-xs text-destructive">
          Open the notes folder before saving a sign-in.
        </p>
      )}
      {validation && (
        <p role="alert" className="m-0 text-xs text-destructive">
          {validation}
        </p>
      )}

      <fieldset className="m-0 flex flex-col gap-2 rounded-small border border-border p-3" disabled={disabled || saving}>
        <legend className="px-1 text-xs font-semibold text-foreground">Sign in to this git link</legend>
        <label className="flex flex-col gap-1 text-xs text-foreground" htmlFor={`${definition.key}-username`}>
          Username
          <input
            id={`${definition.key}-username`}
            type="text"
            autoComplete="username"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            placeholder="GitHub username or oauth2"
            className={inputClassName}
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-foreground" htmlFor={`${definition.key}-token`}>
          Access token
          <input
            id={`${definition.key}-token`}
            type="password"
            autoComplete="current-password"
            value={token}
            onChange={(event) => setToken(event.target.value)}
            placeholder="Paste an access token"
            className={inputClassName}
          />
        </label>
        <p className="m-0 text-xs leading-relaxed text-muted-foreground">
          GitHub: use your username. GitLab: use the username shown for a project token, or <code>oauth2</code> for a personal token.
          The token is saved only in this computer&apos;s keychain.
        </p>
        <button
          type="button"
          disabled={!canSave}
          onClick={() => void save()}
          className="w-fit rounded-small bg-primary px-2 py-1 text-xs text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50"
        >
          {saving ? "Saving link and sign-in…" : "Save link and sign-in"}
        </button>
      </fieldset>
      {(legacyNotice ?? notice) && (
        <p
          role={notice?.startsWith("Git link and sign-in saved") ? "status" : "alert"}
          className="m-0 text-xs text-muted-foreground"
        >
          {legacyNotice ?? notice}
        </p>
      )}
    </div>
  );
}

function redactCredentials(destination: string): string {
  try {
    const url = new URL(destination);
    if (url.username === "" && url.password === "") return destination;
    url.username = "";
    url.password = "";
    return url.toString();
  } catch {
    return destination;
  }
}
