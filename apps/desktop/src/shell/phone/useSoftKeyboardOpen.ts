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
 * The smallest height a soft keyboard takes, in CSS pixels. Android system
 * chrome (status bar, gesture nav) costs well under this; even a small
 * keyboard costs well over it.
 */
const KEYBOARD_MIN_HEIGHT = 150;

/**
 * Whether the viewport is shorter than the screen by enough to be the soft
 * keyboard. Under `adjustResize` the WebView itself resizes, so this is the
 * Android signal — `window.innerHeight - visualViewport.height` stays ~0
 * because both shrink together. `visualViewport.height` is preferred so iOS's
 * visual shrink counts too; `innerHeight` is the fallback.
 */
const viewportShrunk = (): boolean => {
  if (typeof window === "undefined") return false;
  const height = window.visualViewport?.height ?? window.innerHeight;
  return window.screen.height - height > KEYBOARD_MIN_HEIGHT;
};

/**
 * Whether the soft keyboard is plausibly open right now.
 *
 * Two signals, OR'd:
 *
 * - an editable element holds focus **and** the viewport is shrunken. Focus
 *   alone cannot be the signal: on Android, dismissing the keyboard with
 *   Back does not blur the editor, so a focus-only check stays stuck open
 *   and the bubbles never return. `focusin`/`focusout` fire on `document`;
 *   on `focusout`, `event.relatedTarget` is the element taking focus, so
 *   focus moving between editables never reads as a close.
 * - the visualViewport inset is positive (`useKeyboardInset`), which stays
 *   necessary on iOS: it catches a keyboard left up while a non-editable
 *   control owns focus.
 */
export function useSoftKeyboardOpen(): boolean {
  const keyboardInset = useKeyboardInset();

  const [editableFocused, setEditableFocused] = useState<boolean>(() =>
    typeof document === "undefined" ? false : isEditable(document.activeElement)
  );
  const [shrunk, setShrunk] = useState<boolean>(viewportShrunk);

  useEffect(() => {
    // focusin/focusout bubble (focus/blur do not), so one document pair sees
    // every editable, CodeMirror's contenteditable included.
    const onFocusIn = (event: FocusEvent): void =>
      setEditableFocused(isEditable(event.target));
    const onFocusOut = (event: FocusEvent): void =>
      setEditableFocused(isEditable(event.relatedTarget));
    // Window resize is the adjustResize signal; visualViewport resize covers
    // visual-only shrinks. Both must be observed — either can fire alone.
    const onResize = (): void => setShrunk(viewportShrunk());
    onResize();
    document.addEventListener("focusin", onFocusIn);
    document.addEventListener("focusout", onFocusOut);
    window.addEventListener("resize", onResize);
    window.visualViewport?.addEventListener("resize", onResize);
    return () => {
      document.removeEventListener("focusin", onFocusIn);
      document.removeEventListener("focusout", onFocusOut);
      window.removeEventListener("resize", onResize);
      window.visualViewport?.removeEventListener("resize", onResize);
    };
  }, []);

  return keyboardInset > 0 || (editableFocused && shrunk);
}
