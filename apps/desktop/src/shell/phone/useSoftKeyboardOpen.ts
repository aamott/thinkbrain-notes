import { useEffect, useState } from "react";

import { useKeyboardInset } from "./useKeyboardInset";

/**
 * Elements whose focus means a soft keyboard is (or is about to be) up.
 *
 * `.cm-content` is CodeMirror's own contenteditable surface; it is listed on
 * top of the generic attribute selector because a read-only editor's content
 * area may carry a different `contenteditable` value yet should not count —
 * the explicit class keeps the match scoped to the editor DOM the app builds.
 */
const EDITABLE_SELECTOR = 'input, textarea, [contenteditable="true"], .cm-content';

/** Whether `target` is (or sits inside) a text-editable element. */
const isEditable = (target: EventTarget | null): boolean =>
  target instanceof Element && target.closest(EDITABLE_SELECTOR) !== null;

/**
 * Whether the soft keyboard is plausibly open right now.
 *
 * Two signals, OR'd:
 *
 * - an editable element holds focus (`focusin`/`focusout` on `document`).
 *   This is the only signal that works under `adjustResize`, where Android
 *   shrinks the layout viewport itself and `innerHeight -
 *   visualViewport.height` reads ~0 even mid-typing. On `focusout`,
 *   `event.relatedTarget` is the element taking focus, so focus moving
 *   between editables never reads as a close; a blur to nowhere (a null
 *   relatedTarget) does.
 * - the visualViewport inset is positive (`useKeyboardInset`), which stays
 *   necessary on iOS: Safari's `resize` fires late and focus can precede the
 *   keyboard, but the delta catches cases the focus signal misses — like a
 *   keyboard left up while a non-editable control owns focus.
 */
export function useSoftKeyboardOpen(): boolean {
  // The visualViewport delta alone cannot see the keyboard under
  // adjustResize, but it remains a valid second signal for iOS.
  const keyboardInset = useKeyboardInset();

  const [editableFocused, setEditableFocused] = useState<boolean>(() =>
    typeof document === "undefined" ? false : isEditable(document.activeElement)
  );

  useEffect(() => {
    // focusin/focusout bubble (focus/blur do not), so one document pair sees
    // every editable, CodeMirror's contenteditable included.
    const onFocusIn = (event: FocusEvent): void =>
      setEditableFocused(isEditable(event.target));
    const onFocusOut = (event: FocusEvent): void =>
      setEditableFocused(isEditable(event.relatedTarget));
    document.addEventListener("focusin", onFocusIn);
    document.addEventListener("focusout", onFocusOut);
    return () => {
      document.removeEventListener("focusin", onFocusIn);
      document.removeEventListener("focusout", onFocusOut);
    };
  }, []);

  return editableFocused || keyboardInset > 0;
}
