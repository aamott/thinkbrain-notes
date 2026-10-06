/**
 * Git destination plus reusable, labeled sign-in profiles.
 *
 * The link remains an ordinary workspace setting. The selected profile ID is
 * another workspace setting, hidden from its own row. Tokens never join
 * either: they cross the native bridge once and go straight to the OS
 * keychain. Save link and Update sign-in return after persisting; the round
 * trip runs in the background.
 */

import { useEffect, useState } from "react";

import { NativeCommandError } from "../../native/commands";
import {
  forgetSignIn,
  readSignInStatus,
  saveSyncCredentials,
  saveSyncLink
} from "../../sync/syncService";
import type { SignInStatus } from "../../sync/historyTypes";
import { useSettingsStore } from "../settingsStore";
import { inputClassName, type ControlProps } from "../controlRegistry";
import { describeSignInStatus } from "./signInCopy";

const PROFILE_KEY = "sync.signInProfile";
const NEW_VALUE = "new";
const LEGACY_VALUE = "legacy";

export function GitLinkControl({ definition, value, onChange, disabled }: ControlProps) {
  const [username, setUsername] = useState("");
  const [token, setToken] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState<"link" | "sign-in" | "forget" | null>(null);
  const [status, setStatus] = useState<SignInStatus | null>(null);
  const rootPath = useSettingsStore((state) => state.workspaceRootPath);
  const saveSettings = useSettingsStore((state) => state.saveSettings);
  const stageChange = useSettingsStore((state) => state.stageChange);
  const stagedProfile = useSettingsStore((state) => state.stagedChanges[PROFILE_KEY]);
  const loadedProfile = useSettingsStore((state) => state.workspaceValues?.[PROFILE_KEY]);
  const selectedId =
    typeof stagedProfile === "string"
      ? stagedProfile
      : typeof loadedProfile === "string"
        ? loadedProfile
        : "";
  const rawDestination = typeof value === "string" ? value : "";
  const destination = redactCredentials(rawDestination);
  const legacyNotice =
    destination !== rawDestination
      ? "A username or token was removed from this link. Save settings to finish clearing it."
      : null;
  const validation = definition.validation?.(destination) ?? null;
  const isHttps = destination.trim().startsWith("https://");
  const selectValue = selectValueOf(selectedId, status);
  const selectedForHost =
    status?.selected?.saved === true && status.selected.host === status.host;
  const canSaveLink =
    !disabled &&
    busy === null &&
    rootPath !== null &&
    validation === null &&
    isHttps &&
    (selectedForHost || (selectValue === LEGACY_VALUE && status?.legacy !== null));
  const canUpdate =
    !disabled &&
    busy === null &&
    rootPath !== null &&
    validation === null &&
    isHttps &&
    // No credential store (Android today), no point offering to save a token:
    // `store_profile` would only return `sync.auth_required`. Mirrors the
    // import dialog, which hides these fields outright.
    status?.storage === "available" &&
    (selectValue === NEW_VALUE || selectValue === LEGACY_VALUE || selectedForHost) &&
    username.trim() !== "" &&
    token !== "";
  const canForget = !disabled && busy === null && selectedId !== "" && selectValue !== LEGACY_VALUE;

  useEffect(() => {
    if (destination === rawDestination) return;
    onChange(destination);
  }, [destination, onChange, rawDestination]);

  useEffect(() => {
    if (rootPath === null) return;
    let cancelled = false;
    void readSignInStatus(rootPath, destination.trim(), selectedId || null)
      .then((next) => {
        if (!cancelled) setStatus(next);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setNotice(
          error instanceof NativeCommandError
            ? error.message
            : "Could not check whether a sign-in is saved."
        );
      });
    return () => {
      cancelled = true;
    };
  }, [rootPath, destination, selectedId]);

  const persistLink = async (): Promise<boolean> => {
    if ((await saveSettings()).success) return true;
    setNotice("Fix the highlighted settings before saving this git link.");
    return false;
  };

  const run = async (
    kind: NonNullable<typeof busy>,
    fallback: string,
    action: () => Promise<void>
  ): Promise<void> => {
    setBusy(kind);
    setNotice(null);
    try {
      await action();
    } catch (error) {
      setNotice(saveError(error, fallback));
    } finally {
      setBusy(null);
    }
  };

  const saveLink = (): void => {
    if (!canSaveLink || rootPath === null) return;
    void run("link", "Could not save this git link. Check the link and try again.", async () => {
      if (!(await persistLink())) return;
      const profileId = selectValue === NEW_VALUE || selectValue === LEGACY_VALUE ? null : selectValue;
      const saved = await saveSyncLink(rootPath, destination.trim(), profileId);
      stageChange(PROFILE_KEY, saved.profile.id);
      if (saved.migrated) await saveSettings();
      setNotice("Git link saved. Checking this git link.");
    });
  };

  const updateSignIn = (): void => {
    if (!canUpdate || rootPath === null) return;
    void run("sign-in", "Could not save this sign-in. Check the git link and try again.", async () => {
      if (!(await persistLink())) return;
      const updating = selectValue !== NEW_VALUE && selectValue !== LEGACY_VALUE ? selectedId : null;
      const saved = await saveSyncCredentials(
        rootPath,
        destination.trim(),
        username.trim(),
        token,
        updating,
        null
      );
      setToken("");
      stageChange(PROFILE_KEY, saved.profile.id);
      await saveSettings();
      setNotice("Sign-in saved. Checking this git link.");
    });
  };

  const forget = (): void => {
    if (!canForget || selectedId === "") return;
    void run("forget", "Could not forget this sign-in. Unlock your saved sign-ins and try again.", async () => {
      await forgetSignIn(selectedId);
      stageChange(PROFILE_KEY, "");
      await saveSettings();
      setUsername("");
      setToken("");
      setNotice("That sign-in was forgotten on this computer.");
    });
  };

  const statusCopy = status ? describeSignInStatus(status) : null;

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
      {statusCopy && (
        <p role={statusCopy.role} className="m-0 text-xs leading-relaxed text-muted-foreground">
          {statusCopy.text}
        </p>
      )}

      <fieldset className="m-0 flex flex-col gap-2 rounded-small border border-border p-3" disabled={disabled}>
        <legend className="px-1 text-xs font-semibold text-foreground">Sign in to this git link</legend>
        <label className="flex flex-col gap-1 text-xs text-foreground" htmlFor={`${definition.key}-profile`}>
          Saved sign-in
          <select
            id={`${definition.key}-profile`}
            value={selectValue}
            disabled={disabled || busy !== null}
            onChange={(event) => {
              const next = event.target.value;
              if (next === NEW_VALUE || next === LEGACY_VALUE) {
                stageChange(PROFILE_KEY, "");
                return;
              }
              stageChange(PROFILE_KEY, next);
              const profile = status?.profiles.find((entry) => entry.id === next);
              if (profile) setUsername(profile.username);
            }}
            className={inputClassName}
          >
            <option value={NEW_VALUE}>New sign-in</option>
            {selectedId !== "" && !status?.profiles.some((profile) => profile.id === selectedId) && (
              <option value={selectedId}>{status?.selected?.label ?? "Unknown sign-in"}</option>
            )}
            {status?.legacy && (
              <option value={LEGACY_VALUE}>
                {status.legacy.username}@{status.legacy.host} (this repository)
              </option>
            )}
            {status?.profiles.map((profile) => (
              <option key={profile.id} value={profile.id}>
                {profile.label}
              </option>
            ))}
          </select>
        </label>
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
          The token is saved only in this computer&apos;s keychain. Save link reuses the sign-in chosen above.
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={!canSaveLink}
            onClick={saveLink}
            className="w-fit rounded-small bg-primary px-2 py-1 text-xs text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy === "link" ? "Saving link…" : "Save link"}
          </button>
          <button
            type="button"
            disabled={!canUpdate}
            onClick={updateSignIn}
            className="w-fit rounded-small border border-border bg-surface px-2 py-1 text-xs text-foreground disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy === "sign-in" ? "Updating sign-in…" : "Update sign-in"}
          </button>
          <button
            type="button"
            disabled={!canForget}
            onClick={forget}
            className="w-fit rounded-small px-2 py-1 text-xs text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy === "forget" ? "Forgetting…" : "Forget sign-in"}
          </button>
        </div>
      </fieldset>
      {(legacyNotice ?? notice) && (
        <p
          role={notice?.startsWith("Git link saved") || notice?.startsWith("Sign-in saved") ? "status" : "alert"}
          className="m-0 text-xs text-muted-foreground"
        >
          {legacyNotice ?? notice}
        </p>
      )}
    </div>
  );
}

function selectValueOf(selectedId: string, status: SignInStatus | null): string {
  if (selectedId !== "") return selectedId;
  if (status?.legacy) return LEGACY_VALUE;
  return NEW_VALUE;
}

function saveError(error: unknown, fallback: string): string {
  return error instanceof NativeCommandError ? error.message : fallback;
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
