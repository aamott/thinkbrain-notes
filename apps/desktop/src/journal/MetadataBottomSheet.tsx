import type { JournalFieldDefinition, JournalFieldValue } from "@thinkbrain/core";
import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";

import { useKeyboardInset } from "../shell/phone/useKeyboardInset";
import { MetadataField } from "./MetadataField";
import { FieldAffordances } from "./MetadataWidget";

/**
 * Metadata editing on a phone (M-2, D40) under the contract D78 set.
 *
 * It is a dialog named for the entry's date, it holds focus while it is open
 * and hands it back to the control that opened it, and swipe, scrim and the
 * shell's back all land in the same place — the note.
 *
 * Values save as they change, so `Done` closes rather than commits: a sheet
 * dismissed by a stray thumb must not lose what was already chosen.
 */

/** A swipe shorter than this is a thumb resting, not a dismissal. */
const SWIPE_THRESHOLD_PX = 48;

export interface MetadataBottomSheetProps {
  /** The entry's date, which is what the dialog is named for (D78). */
  readonly title: string;
  readonly definitions: readonly JournalFieldDefinition[];
  readonly values: Readonly<Record<string, JournalFieldValue>>;
  readonly onSet: (fieldId: string, value: JournalFieldValue | undefined) => void;
  readonly onDismiss: () => void;
  /** Rendered after the fields — the entry's own "add a field" row (D86). */
  readonly children?: ReactNode;
  /** Disables all editable controls when true (e.g., when there is no write path). */
  readonly readOnly?: boolean;
  /** Fields invented for keys the settings do not know (D85). */
  readonly unconfigured?: readonly JournalFieldDefinition[];
  /** Promotes an unconfigured key into a configured field. */
  readonly onDefineField?: (definition: JournalFieldDefinition) => void;
  /** Adds a value to a configured select field's options (D84). */
  readonly onAddOption?: (fieldId: string, option: string) => void;
}

const FOCUSABLE = 'button, input, select, textarea, [href], [tabindex]:not([tabindex="-1"])';

export function MetadataBottomSheet({
  title,
  definitions,
  values,
  onSet,
  onDismiss,
  children,
  readOnly = false,
  unconfigured = [],
  onDefineField,
  onAddOption
}: MetadataBottomSheetProps) {
  const sheetRef = useRef<HTMLDivElement>(null);
  const swipeStart = useRef<number | null>(null);
  const inset = useKeyboardInset();

  // Captured on mount and restored on unmount, so the sheet hands focus back to
  // whatever opened it however it was dismissed (D78).
  useEffect(() => {
    const opener = document.activeElement;
    const first = sheetRef.current?.querySelector<HTMLElement>(FOCUSABLE);
    (first ?? sheetRef.current)?.focus();
    return () => {
      if (opener instanceof HTMLElement) opener.focus();
    };
  }, []);

  const onKeyDown = (event: React.KeyboardEvent): void => {
    if (event.key === "Escape") {
      event.preventDefault();
      onDismiss();
      return;
    }
    if (event.key !== "Tab") return;
    // Trapped: a phone dialog with focus loose behind it is unusable with a
    // screen reader, which reads the note it is covering.
    const focusable = [...(sheetRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [])];
    if (focusable.length === 0) return;
    const first = focusable[0]!;
    const last = focusable.at(-1)!;
    const active = document.activeElement;
    if (event.shiftKey && active === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  };

  // Portalled to the body: a fixed element inside a transformed ancestor is
  // positioned against that ancestor instead of the viewport, and the sheet
  // renders inside the editor's own scrolling tree.
  return createPortal(
    <>
      <div
        data-sheet-scrim
        onClick={onDismiss}
        // `bg-overlay` is the shell's own scrim token, the one the command
        // palette dims with; D31 keeps journal surfaces on `--tn-*`.
        className="fixed inset-0 z-40 bg-overlay"
        aria-hidden="true"
      />
      <div
        ref={sheetRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        onKeyDown={onKeyDown}
        style={{ bottom: `${inset}px` }}
        className="fixed inset-x-0 z-50 flex flex-col gap-3 rounded-t-large border-t border-border bg-panel px-4 pb-6 pt-2 text-panel-foreground"
      >
        <div
          data-sheet-grabber
          aria-hidden="true"
          onTouchStart={(event) => {
            swipeStart.current = event.touches[0]?.clientY ?? null;
          }}
          onTouchEnd={(event) => {
            const start = swipeStart.current;
            swipeStart.current = null;
            const end = event.changedTouches[0]?.clientY;
            if (start === null || end === undefined) return;
            if (end - start >= SWIPE_THRESHOLD_PX) onDismiss();
          }}
          className="mx-auto h-1 w-9 shrink-0 rounded-full bg-border"
        />

        <div className="flex items-baseline gap-2">
          <h2 className="m-0 text-sm font-semibold">{title}</h2>
          <button
            type="button"
            aria-label="Done"
            onClick={onDismiss}
            className="ml-auto min-h-11 rounded-small px-3 text-sm font-semibold text-primary cursor-pointer"
          >
            Done
          </button>
        </div>

        <div className="flex flex-col gap-2">
          {definitions.map((definition) => (
            <div key={definition.id} className="flex flex-col gap-0.5">
              <MetadataField
                definition={definition}
                value={values[definition.id]}
                size="touch"
                onSet={(value) => onSet(definition.id, value)}
                readOnly={readOnly}
              />
              <FieldAffordances
                definition={definition}
                value={values[definition.id]}
                isUnconfigured={unconfigured.includes(definition)}
                readOnly={readOnly}
                onDefineField={onDefineField}
                onAddOption={onAddOption}
              />
            </div>
          ))}
          {children}
        </div>
      </div>
    </>,
    document.body
  );
}
