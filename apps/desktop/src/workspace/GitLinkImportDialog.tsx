/**
 * Dialog for bringing a new notes folder in from a git link.
 *
 * Progress is scoped to this dialog's request ID. Native code opens the new
 * window on success so closing this one cannot lose a finished import.
 */

import { useEffect, useId, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";

import { NativeCommandError } from "../native/commands";
import { pickDirectoryPath } from "../native/dialogs";
import { readSignInStatus } from "../sync/syncService";
import type { SignInStatus } from "../sync/historyTypes";
import {
  importWorkspaceFromGitLink,
  previewWorkspaceFromGitLink,
  subscribeToWorkspaceImport,
  type GitLinkPreview,
  type WorkspaceImportProgress
} from "./gitLinkImport";
import {
  IMPORT_DIALOG_TITLE,
  importPhaseText,
  NO_PROFILE_LABEL,
  recoveryForImport,
  validateImportLink
} from "./gitLinkImportCopy";

const inputClassName =
  "w-full rounded-small border border-border bg-surface px-2 py-1 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50";

export interface GitLinkImportDialogProps {
  readonly onClose: () => void;
}

export function GitLinkImportDialog({ onClose }: GitLinkImportDialogProps) {
  const dialogRef = useRef<HTMLElement>(null);
  const linkInputRef = useRef<HTMLInputElement>(null);
  const onCloseRef = useRef(onClose);
  const requestRef = useRef<string | null>(null);
  const earlyProgress = useRef(new Map<string, WorkspaceImportProgress>());
  const titleId = useId();
  const previewId = useId();
  const [destination, setDestination] = useState("");
  const [parentPath, setParentPath] = useState("");
  const [profileId, setProfileId] = useState("");
  const [previewResult, setPreviewResult] = useState<{
    readonly key: string;
    readonly preview: GitLinkPreview;
  } | null>(null);
  const [status, setStatus] = useState<SignInStatus | null>(null);
  const [listening, setListening] = useState(false);
  const [busy, setBusy] = useState(false);
  const [phase, setPhase] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const linkError = validateImportLink(destination);
  const previewKey = `${destination.trim()}\0${parentPath}`;
  const preview = previewResult?.key === previewKey ? previewResult.preview : null;
  const profiles = status?.profiles ?? [];
  const selectedInList = profiles.some((profile) => profile.id === profileId);
  const selectedMissing =
    profileId !== "" && (!selectedInList || status?.selected?.saved !== true);
  const canSubmit =
    listening && !busy && linkError === null && parentPath !== "" && preview !== null && !selectedMissing;

  useEffect(() => {
    linkInputRef.current?.focus();
  }, []);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    let cancelled = false;
    void readSignInStatus("", destination.trim(), profileId || null)
      .then((next) => {
        if (!cancelled) setStatus(next);
      })
      .catch(() => {
        if (!cancelled) setStatus(null);
      });
    return () => {
      cancelled = true;
    };
  }, [destination, profileId]);

  useEffect(() => {
    if (linkError !== null || parentPath === "") return;
    let cancelled = false;
    void previewWorkspaceFromGitLink(destination.trim(), parentPath)
      .then((next) => {
        if (!cancelled) setPreviewResult({ key: previewKey, preview: next });
      })
      .catch((caught: unknown) => {
        if (cancelled) return;
        setPreviewResult(null);
        setError(caught instanceof NativeCommandError ? caught.message : "Could not preview that folder name.");
      });
    return () => {
      cancelled = true;
    };
  }, [destination, parentPath, linkError, previewKey]);

  useEffect(() => {
    let cancelled = false;
    let unlisten: (() => void) | undefined;
    const queued = earlyProgress.current;
    void subscribeToWorkspaceImport((event) => {
      const requestId = requestRef.current;
      if (requestId === null) {
        queued.set(event.requestId, event);
      } else if (event.requestId === requestId) {
        applyProgress(event, setPhase, setError, setBusy, () => onCloseRef.current());
      }
    }).then((stop) => {
      if (cancelled) stop();
      else {
        unlisten = stop;
        setListening(true);
      }
    }).catch(() => {
      if (!cancelled) setError("Could not listen for progress from the new workspace.");
    });
    return () => {
      cancelled = true;
      unlisten?.();
      queued.clear();
    };
  }, []);

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLElement>) => {
    if (event.key === "Escape" && !busy) {
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key !== "Tab") return;
    const focusable = Array.from(
      dialogRef.current?.querySelectorAll<HTMLElement>("button:not([disabled]), input:not([disabled]), select:not([disabled])") ?? []
    );
    if (focusable.length === 0) return;
    const index = focusable.indexOf(document.activeElement as HTMLElement);
    event.preventDefault();
    focusable[(index + (event.shiftKey ? focusable.length - 1 : 1)) % focusable.length]?.focus();
  };

  const chooseParent = async (): Promise<void> => {
    const selected = await pickDirectoryPath("Choose a parent folder");
    if (selected) {
      setParentPath(selected);
      setError(null);
    }
  };

  const submit = async (): Promise<void> => {
    if (!canSubmit) return;
    requestRef.current = null;
    earlyProgress.current.clear();
    setBusy(true);
    setError(null);
    setPhase("checking");
    try {
      const started = await importWorkspaceFromGitLink(
        destination.trim(),
        parentPath,
        profileId || null
      );
      requestRef.current = started.requestId;
      const early = earlyProgress.current.get(started.requestId);
      if (early) {
        earlyProgress.current.delete(started.requestId);
        applyProgress(early, setPhase, setError, setBusy, onClose);
      }
    } catch (caught) {
      setBusy(false);
      setError(importError(caught, "Could not start bringing these notes in."));
    }
  };

  return (
    <div className="fixed z-30 inset-0 flex items-start justify-center pt-[12vh] bg-overlay" role="presentation">
      <section
        ref={dialogRef}
        tabIndex={-1}
        className="grid gap-3 w-[min(28rem,calc(100vw-2rem))] p-[1.15rem] border border-border rounded-medium text-foreground bg-popover shadow-soft"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-busy={busy}
        onKeyDown={handleKeyDown}
      >
        <h2 id={titleId} className="m-0 text-base font-semibold">
          {IMPORT_DIALOG_TITLE}
        </h2>
        <label className="flex flex-col gap-1 text-xs text-foreground" htmlFor="git-link-import-url">
          Git link
          <input
            ref={linkInputRef}
            id="git-link-import-url"
            type="url"
            value={destination}
            disabled={busy}
            onChange={(event) => setDestination(event.target.value)}
            placeholder="https://github.com/you/notes.git"
            className={inputClassName}
          />
        </label>
        {linkError && destination.trim() !== "" && (
          <p role="alert" className="m-0 text-xs text-destructive">
            {linkError}
          </p>
        )}
        <div className="flex flex-col gap-1">
          <span className="text-xs text-foreground">Parent folder</span>
          <div className="flex gap-2">
            <p className="m-0 min-w-0 flex-1 truncate rounded-small border border-border bg-surface px-2 py-1 text-xs text-muted-foreground">
              {parentPath || "Choose where to put the new folder"}
            </p>
            <button
              type="button"
              disabled={busy}
              onClick={() => void chooseParent()}
              className="shrink-0 rounded-small border border-border bg-surface px-2 py-1 text-xs text-foreground disabled:opacity-50"
            >
              Browse…
            </button>
          </div>
        </div>
        <p id={previewId} className="m-0 text-xs text-muted-foreground">
          {preview
            ? `New folder: ${preview.childName}`
            : "The new folder name comes from the git link once a parent folder is chosen."}
        </p>
        <label className="flex flex-col gap-1 text-xs text-foreground" htmlFor="git-link-import-profile">
          Saved sign-in
          <select
            id="git-link-import-profile"
            value={profileId}
            disabled={busy}
            onChange={(event) => setProfileId(event.target.value)}
            className={inputClassName}
          >
            <option value="">{NO_PROFILE_LABEL}</option>
            {profileId !== "" && !selectedInList && (
              <option value={profileId}>{status?.selected?.label ?? "Unknown sign-in"}</option>
            )}
            {profiles.map((profile) => (
              <option key={profile.id} value={profile.id}>
                {profile.label}
              </option>
            ))}
          </select>
        </label>
        {selectedMissing && (
          <p role="alert" className="m-0 text-xs text-destructive">
            This sign-in is not available for the selected git host.
          </p>
        )}
        {busy && (
          <p role="status" className="m-0 flex items-center gap-2 text-xs text-muted-foreground">
            <span className="inline-block size-3.5 animate-spin rounded-full border-2 border-border border-t-foreground" aria-hidden="true" />
            {importPhaseText(phase ?? "checking")}
          </p>
        )}
        {error && (
          <p role="alert" className="m-0 text-xs text-destructive">
            {error}
          </p>
        )}
        <div className="flex flex-wrap justify-end gap-[0.45rem]">
          <button
            type="button"
            className="border border-border rounded-small px-[0.6rem] py-[0.4rem] text-foreground bg-surface cursor-pointer font-inherit text-xs"
            onClick={onClose}
          >
            {busy ? "Hide" : "Cancel"}
          </button>
          <button
            type="button"
            disabled={!canSubmit}
            onClick={() => void submit()}
            className="rounded-small bg-primary px-[0.6rem] py-[0.4rem] text-xs text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50"
          >
            Bring in
          </button>
        </div>
      </section>
    </div>
  );
}

function applyProgress(
  event: WorkspaceImportProgress,
  setPhase: (value: string | null) => void,
  setError: (value: string | null) => void,
  setBusy: (value: boolean) => void,
  onClose: () => void
): void {
  if (event.state === "ok") {
    setBusy(false);
    onClose();
    return;
  }
  if (event.state === "failed") {
    setBusy(false);
    setPhase(null);
    setError(importError(event.error, "Could not bring these notes in."));
    return;
  }
  setPhase(event.phase ?? event.state);
}

function importError(cause: unknown, fallback: string): string {
  const shaped = typeof cause === "object" && cause !== null
    ? cause as { readonly code?: unknown; readonly message?: unknown }
    : null;
  const code = typeof shaped?.code === "string" ? shaped.code : "";
  const message = code && typeof shaped?.message === "string" ? shaped.message : fallback;
  return `${message} ${recoveryForImport(code)}`;
}
