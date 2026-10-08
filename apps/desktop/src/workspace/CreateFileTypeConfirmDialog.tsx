import { useId } from "react";
import { ModalDialog } from "../shell/ModalDialog";

const DESCRIPTION =
  "The .md ending tells ThinkBrain to open a file as a Markdown note. Without it, this file may open as plain text or in another editor.";

/**
 * Confirmation a New note submission gets when the name is valid but does not
 * end in `.md`/`.markdown`. "Keep editing" is the safe default every dismissal
 * path lands on — Escape, scrim, Android Back — so a stray gesture can never
 * create a file the user did not mean to make.
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
  const fileNameId = useId();
  const dismiss = () => {
    if (!busy) onKeepEditing();
  };

  return (
    <ModalDialog
      title="Create a different file type?"
      description={
        <>
          {DESCRIPTION}
          <span id={fileNameId} className="mt-1 block truncate" title={fileName}>
            File name: {fileName}
          </span>
        </>
      }
      busy={busy}
      onDismiss={dismiss}
    >
      {error && (
        <p role="alert" className="m-0 text-xs text-danger">
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
    </ModalDialog>
  );
}
