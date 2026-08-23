/**
 * The kept versions of one note, each restorable.
 *
 * Shared by the two surfaces that offer recovery: the pane a note that cannot
 * be decoded falls back to, and the banner a note that went empty gets. They
 * are different situations and belong on different surfaces, but the list of
 * versions and the care taken over restoring one is the same in both.
 *
 * Restoring asks first. It overwrites the note, and although the write keeps
 * what it replaced — so the choice is undoable — someone reaching this screen
 * has already lost something once and should not lose it twice to a misclick.
 * The confirmation is inline rather than a modal: the pane is not a task the
 * user started, so taking focus away from where they were is the wrong trade,
 * and `DirtyCloseDialog` stays the modal for the one decision that genuinely
 * blocks (closing over unsaved work).
 */

import { useEffect, useState } from "react";

import { listNoteVersions, restoreNoteVersion, type KeptVersion } from "../workspace/noteBackupService";
import { bannerButtonClass, bannerButtonPrimaryClass } from "./bannerButton";

/** Props for {@link NoteVersionList}. */
export interface NoteVersionListProps {
  readonly rootPath: string;
  readonly relativePath: string;
  /** Called after a successful restore, so the tab can re-read the note. */
  readonly onRestored: () => void;
}

/** Bytes as something a person reads, without pretending to precision. */
function describeSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} bytes`;
  return `${Math.round(bytes / 1024)} KB`;
}

export function NoteVersionList({ rootPath, relativePath, onRestored }: NoteVersionListProps) {
  const [versions, setVersions] = useState<readonly KeptVersion[] | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void listNoteVersions(rootPath, relativePath)
      .then((kept) => {
        if (active) setVersions(kept);
      })
      .catch(() => {
        // Nothing to offer is not an error worth its own message: the surface
        // above already says what went wrong with the note itself.
        if (active) setVersions([]);
      });
    return () => {
      active = false;
    };
  }, [rootPath, relativePath]);

  if (versions === null) {
    return <p className="m-0 text-xs text-muted-foreground">Looking for kept versions…</p>;
  }

  if (versions.length === 0) {
    return (
      <p className="m-0 text-xs text-muted-foreground">
        No earlier version of this note was kept on this device. Versions are kept here from the
        next save onwards, and saved versions from other devices are in the History panel.
      </p>
    );
  }

  const restore = (version: KeptVersion) => {
    setFailure(null);
    void restoreNoteVersion(rootPath, relativePath, version.path)
      .then(() => {
        setConfirming(null);
        onRestored();
      })
      .catch((cause: unknown) => {
        setConfirming(null);
        setFailure(
          cause instanceof Error ? cause.message : "That version could not be put back."
        );
      });
  };

  return (
    <div className="flex flex-col gap-2">
      <ul className="flex flex-col gap-1 m-0 p-0 list-none">
        {versions.map((version) => (
          <li
            key={version.path}
            className="flex flex-wrap items-center gap-2 py-1 text-xs text-foreground"
          >
            <span className="flex-1 min-w-3xs">
              {new Date(version.keptAt).toLocaleString()}
              <span className="ml-2 text-muted-foreground">{describeSize(version.byteSize)}</span>
            </span>
            {confirming === version.path ? (
              <>
                <span className="text-muted-foreground">Replace the note with this version?</span>
                <button
                  type="button"
                  className={bannerButtonPrimaryClass}
                  onClick={() => restore(version)}
                >
                  Restore
                </button>
                <button
                  type="button"
                  className={bannerButtonClass}
                  onClick={() => setConfirming(null)}
                >
                  Cancel
                </button>
              </>
            ) : (
              <button
                type="button"
                className={bannerButtonClass}
                onClick={() => setConfirming(version.path)}
              >
                Restore this version
              </button>
            )}
          </li>
        ))}
      </ul>
      <p className="m-0 text-xs text-muted-foreground">
        Restoring keeps the version it replaces, so you can come back to it.
      </p>
      {failure && (
        <p role="alert" className="m-0 text-xs text-destructive">
          {failure}
        </p>
      )}
    </div>
  );
}
