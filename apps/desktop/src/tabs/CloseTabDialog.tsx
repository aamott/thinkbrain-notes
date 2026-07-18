import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";

import styles from "./CloseTabDialog.module.css";

interface CloseTabDialogProps {
  readonly isSaving: boolean;
  readonly onCancel: () => void;
  readonly onDiscard: () => void;
  readonly onSave: () => void;
  readonly title: string;
}

/** Explicit Save, Discard, and Cancel contract for unsaved editor tabs. */
export function CloseTabDialog({
  isSaving,
  onCancel,
  onDiscard,
  onSave,
  title
}: CloseTabDialogProps) {
  const dialogRef = useRef<HTMLElement | null>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    previousFocusRef.current = document.activeElement as HTMLElement | null;

    return () => previousFocusRef.current?.focus();
  }, []);

  useEffect(() => {
    const appRoot = document.getElementById("root");
    if (!appRoot) {
      return;
    }

    appRoot.inert = true;
    appRoot.setAttribute("aria-hidden", "true");

    return () => {
      appRoot.inert = false;
      appRoot.removeAttribute("aria-hidden");
    };
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !isSaving) {
        onCancel();
        return;
      }

      if (event.key !== "Tab") {
        return;
      }

      const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(
        "button:not([disabled])"
      );
      if (!focusable?.length) {
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!first || !last) {
        return;
      }

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isSaving, onCancel]);

  return createPortal(
    <div className={styles.backdrop} role="presentation">
      <section
        aria-describedby="close-tab-description"
        aria-labelledby="close-tab-title"
        aria-modal="true"
        className={styles.dialog}
        ref={dialogRef}
        role="dialog"
      >
        <h2 id="close-tab-title">Save changes before closing?</h2>
        <p id="close-tab-description">
          {title} has unsaved changes. Save them, discard them, or keep editing.
        </p>
        <div className={styles.actions}>
          <button autoFocus disabled={isSaving} onClick={onCancel} type="button">
            Cancel
          </button>
          <button disabled={isSaving} onClick={onDiscard} type="button">
            Discard
          </button>
          <button
            className={styles.saveButton}
            disabled={isSaving}
            onClick={onSave}
            type="button"
          >
            {isSaving ? "Saving..." : "Save"}
          </button>
        </div>
      </section>
    </div>,
    document.body
  );
}
