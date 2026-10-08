import { useState } from "react";
import type { NativeKnownWorkspace } from "../native/commands";
import { ModalDialog } from "../shell/ModalDialog";

const DELETE_DESCRIPTION =
  "This permanently deletes the vault and its notes from this device, along with its file history, search index and backups. This can’t be undone.";

/**
 * Type-the-name confirmation for deleting a managed vault. It opens *above*
 * the workspace manager: while it is up, the manager below is inert and
 * Escape dismisses only this dialog.
 *
 * The pending flag is owned here rather than borrowed from the explorer's
 * operation counter — the deletion is this dialog's job, so "in flight" is
 * local: it disables the input and both buttons, blocks dismissal, and makes
 * a second submit a no-op for the duration of the native call.
 */
export function DeleteWorkspaceDialog({
  workspace,
  error,
  onCancel,
  onDelete
}: {
  readonly workspace: NativeKnownWorkspace;
  readonly error: string | null;
  readonly onCancel: () => void;
  readonly onDelete: () => Promise<boolean>;
}) {
  const [confirmation, setConfirmation] = useState("");
  const [pending, setPending] = useState(false);
  const name = workspace.name;
  const confirmed = confirmation === name;
  const dismiss = () => {
    if (!pending) onCancel();
  };

  const submit = async () => {
    if (pending || !confirmed) return;
    setPending(true);
    try {
      await onDelete();
    } finally {
      setPending(false);
    }
  };

  return (
    <ModalDialog
      title={`Delete “${name}”?`}
      description={DELETE_DESCRIPTION}
      busy={pending}
      onDismiss={dismiss}
    >
      <form
        className="grid gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <label className="grid gap-1 text-xs">
          Type {name} to confirm
          <input
            autoFocus
            className="min-h-11 rounded-small border border-border bg-surface px-2 py-1.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            disabled={pending}
            value={confirmation}
            onChange={(event) => setConfirmation(event.target.value)}
          />
        </label>
        {error && (
          <p className="m-0 text-xs text-danger" role="alert">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <button
            type="button"
            className="min-h-11 rounded-small border border-border px-3 text-xs disabled:opacity-50"
            disabled={pending}
            onClick={dismiss}
          >
            Cancel
          </button>
          <button
            type="submit"
            className="min-h-11 rounded-small bg-danger px-3 text-xs text-danger-foreground disabled:opacity-50"
            disabled={pending || !confirmed}
          >
            Delete workspace
          </button>
        </div>
      </form>
    </ModalDialog>
  );
}
