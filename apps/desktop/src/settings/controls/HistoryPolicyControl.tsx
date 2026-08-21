/**
 * Disk usage, free-space, and clear-undo controls for private restore copies.
 *
 * The 90-day and 25 MB figures are app-wide defaults, not a promised size cap.
 * Clearing drops only this computer's undo copies; notes and synced history stay.
 */

import { useEffect, useState } from "react";

import {
  DEFAULT_CHECKPOINT_RETENTION_DAYS,
  DEFAULT_HISTORICAL_FILE_LIMIT_MB
} from "@thinkbrain/core";

import { NativeCommandError } from "../../native/commands";
import { clearUndoHistory, freeSyncSpace, readHistoryUsage } from "../../sync/syncService";
import type { HistoryCleanup } from "../../sync/historyTypes";
import { inputClassName, type ControlProps } from "../controlRegistry";
import { useSettingsStore } from "../settingsStore";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} bytes`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function describeCleanup(done: HistoryCleanup): string {
  if (done.reclaimed <= 0) {
    return "Nothing extra could be freed. Current notes and the latest undo copy always stay.";
  }
  return `Freed ${formatBytes(done.reclaimed)}.`;
}

export function HistoryPolicyControl({ definition, disabled }: ControlProps) {
  const rootPath = useSettingsStore((state) => state.workspaceRootPath);
  const [bytes, setBytes] = useState<number | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState<"free" | "clear" | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);

  useEffect(() => {
    if (rootPath === null) return;
    let cancelled = false;
    void readHistoryUsage(rootPath)
      .then((usage) => {
        if (!cancelled) setBytes(usage.bytes);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setNotice(
          error instanceof NativeCommandError
            ? error.message
            : "Could not read how much undo history this folder uses."
        );
      });
    return () => {
      cancelled = true;
    };
  }, [rootPath]);

  const run = async (action: "free" | "clear"): Promise<void> => {
    if (rootPath === null || busy !== null) return;
    setBusy(action);
    setNotice(null);
    try {
      const done = action === "free" ? await freeSyncSpace(rootPath) : await clearUndoHistory(rootPath);
      setBytes(done.bytesAfter);
      setNotice(describeCleanup(done));
      setConfirmClear(false);
    } catch (error) {
      setNotice(
        error instanceof NativeCommandError
          ? error.message
          : action === "free"
            ? "Could not free space. Check this computer has room, then try again."
            : "Could not clear undo history. Check this computer has room, then try again."
      );
      if (action === "clear") setConfirmClear(false);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="flex w-full max-w-lg flex-col gap-3">
      {rootPath === null ? (
        <p className="m-0 text-xs leading-relaxed text-muted-foreground">
          Open a notes folder to see how much undo history it uses on this computer.
        </p>
      ) : (
        <p id={`${definition.key}-usage`} className="m-0 text-sm text-foreground">
          {bytes === null
            ? "Reading how much undo history this folder uses…"
            : `This folder's undo history uses ${formatBytes(bytes)} on this computer.`}
        </p>
      )}
      <p className="m-0 text-xs leading-relaxed text-muted-foreground">
        Kept for {DEFAULT_CHECKPOINT_RETENTION_DAYS} days. Files larger than{" "}
        {DEFAULT_HISTORICAL_FILE_LIMIT_MB} MB are dropped from older undo copies only.
        Leftover copies already bundled on disk are not rewritten, so this is not a guaranteed size cap.
      </p>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={disabled || busy !== null || rootPath === null}
          onClick={() => void run("free")}
          className="w-fit rounded-small bg-primary px-2 py-1 text-xs text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy === "free" ? "Freeing space…" : "Free space now"}
        </button>
        {!confirmClear ? (
          <button
            type="button"
            disabled={disabled || busy !== null || rootPath === null}
            onClick={() => setConfirmClear(true)}
            className={`${inputClassName} w-fit cursor-pointer text-xs disabled:cursor-not-allowed`}
          >
            Clear undo history
          </button>
        ) : (
          <div className="flex flex-col gap-2 rounded-small border border-border p-3">
            <p className="m-0 text-xs leading-relaxed text-foreground">
              This removes saved undo copies on this computer. Your notes and synced history stay.
              This cannot be undone.
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={disabled || busy !== null}
                onClick={() => void run("clear")}
                className="w-fit rounded-small bg-destructive px-2 py-1 text-xs text-destructive-foreground disabled:cursor-not-allowed disabled:opacity-50"
              >
                {busy === "clear" ? "Clearing…" : "Clear undo history"}
              </button>
              <button
                type="button"
                disabled={busy !== null}
                onClick={() => setConfirmClear(false)}
                className={`${inputClassName} w-fit cursor-pointer text-xs`}
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
      {notice && (
        <p
          role={notice.startsWith("Freed") || notice.startsWith("Nothing extra") ? "status" : "alert"}
          className="m-0 text-xs text-muted-foreground"
        >
          {notice}
        </p>
      )}
    </div>
  );
}
