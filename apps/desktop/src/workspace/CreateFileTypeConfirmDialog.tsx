import { useEffect, useId } from "react";
import { createPortal } from "react-dom";
import { useDismissable } from "@thinkbrain/ui";

const DESCRIPTION =
  "The .md ending tells ThinkBrain to open a file as a Markdown note. Without it, this file may open as plain text or in another editor.";

/**
 * Confirmation a New note submission gets when the name is valid but does not
 * end in `.md`/`.markdown`. "Keep editing" is the safe default every dismissal
 * path lands on — Escape, scrim, Android Back — so a stray gesture can never
 * create a file the user did not mean to make.
 *
 * Portalled to the body so the app's #root can be made inert and so nothing in
 * the explorer's own tree can position or clip it.
 */
export function CreateFileTypeConfirmDialog({
  fileName,
  busy = false,
  error = null,
  onKeepEditing,
  onCreateAnyway
}: {
  readonly fileName: string;
  readonly busy?: boolean;
  readonly error?: string | null;
  readonly onKeepEditing: () => void;
  readonly onCreateAnyway: () => void;
}) {
  const titleId = useId();
  const descriptionId = useId();
  const fileNameId = useId();
  const errorId = useId();
  const dismiss = () => {
    if (!busy) onKeepEditing();
  };

  // Declared before useDismissable so this cleanup runs first on unmount:
  // the background must become interactive again before focus is restored to
  // the inline input inside it. In tests the explorer may mount outside #root,
  // in which case the explorer section itself is the background to inert.
  useEffect(() => {
    const background: HTMLElement | null =
      document.getElementById("root") ??
      document.querySelector('section[aria-label="Workspace explorer"]');
    const wasInert = background?.inert ?? false;
    if (background) background.inert = true;
    return () => {
      if (background) background.inert = wasInert;
    };
  }, []);

  const { containerRef } = useDismissable({ open: true, onDismiss: dismiss });

  return createPortal(
    <>
      <div
        aria-hidden="true"
        className="fixed inset-0 z-40 bg-overlay"
        onClick={dismiss}
      />
      <div
        ref={containerRef}
        role="dialog"
        aria-modal="true"
        aria-busy={busy}
        aria-labelledby={titleId}
        aria-describedby={`${descriptionId} ${fileNameId}${error ? ` ${errorId}` : ""}`}
        className="fixed left-1/2 top-[18vh] z-50 grid w-[min(26rem,calc(100vw-2rem))] -translate-x-1/2 gap-3 rounded-medium border border-border bg-popover p-4 text-foreground shadow-soft"
      >
        <h2 id={titleId} className="m-0 text-base font-semibold">
          Create a different file type?
        </h2>
        <p id={descriptionId} className="m-0 text-xs leading-relaxed text-muted-foreground">
          {DESCRIPTION}
        </p>
        <p id={fileNameId} className="m-0 truncate text-xs text-muted-foreground" title={fileName}>
          File name: {fileName}
        </p>
        {error && (
          <p id={errorId} role="alert" className="m-0 text-xs text-danger">
            {error}
          </p>
        )}
        <div className="flex flex-wrap justify-end gap-2">
          <button
            type="button"
            className="min-h-11 min-w-11 rounded-small border border-border px-3 text-xs focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-50"
            disabled={busy}
            onClick={dismiss}
          >
            Keep editing
          </button>
          <button
            type="button"
            className="min-h-11 min-w-11 rounded-small bg-primary px-3 text-xs text-primary-foreground focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-50"
            disabled={busy}
            onClick={onCreateAnyway}
          >
            Create anyway
          </button>
        </div>
      </div>
    </>,
    document.body
  );
}
