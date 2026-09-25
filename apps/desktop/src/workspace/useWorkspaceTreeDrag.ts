/**
 * Pointer/keyboard drag-and-drop controller for the workspace tree.
 *
 * One instance is created in `WorkspaceExplorerView` and passed down to every
 * row. Pointer Events only — never the HTML5 drag API, which does not reach
 * Android WebViews reliably and gives no control over touch scrolling.
 *
 * Gesture rules:
 * - Mouse/pen drags start from the row's main button on the primary button,
 *   after a small movement threshold so plain clicks never become drags.
 * - Touch drags start only from the dedicated row handle (`touch-none`), so
 *   scrolling and tapping a row on a phone behave normally.
 * - Drop targets are the workspace root and folders only; hovering a file
 *   shows an invalid target instead of silently falling back to the root.
 * - A collapsed folder held under the pointer auto-expands, and the tree
 *   scrolls when the pointer nears its top or bottom edge.
 *
 * The dedicated handle is also the keyboard interface: Enter/Space picks the
 * row up, ArrowUp/ArrowDown cycles the valid destinations (workspace root,
 * then visible folders), Enter/Space drops, and Escape cancels. An
 * `aria-live` announcement reports each step.
 */

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type RefObject
} from "react";
import type { NativeWorkspaceEntry } from "../native/commands";
import {
  isInvalidWorkspaceMove,
  WORKSPACE_INVALID_MOVE_MESSAGE,
  workspaceMoveDestination
} from "./workspaceMove";

/** Distance in px a pointer must travel before a press becomes a drag. */
export const WORKSPACE_DRAG_THRESHOLD_PX = 6;
/** Hover time before a collapsed folder target expands. */
export const WORKSPACE_DRAG_AUTO_EXPAND_MS = 600;
/** Distance from the scroll container's edge that starts auto-scrolling. */
export const WORKSPACE_DRAG_AUTOSCROLL_EDGE_PX = 28;
const AUTOSCROLL_STEP_PX = 14;

/** DOM marker placed on every tree row wrapper. */
export const WORKSPACE_TREE_ROW_ATTR = "data-workspace-tree-row";
/** DOM marker placed on a row's drag handle; its value is the row's path. */
export const WORKSPACE_DRAG_HANDLE_ATTR = "data-workspace-drag-handle";
/** DOM marker placed on rows that are folders; its value is the drop parent path. */
export const WORKSPACE_DROP_PARENT_ATTR = "data-workspace-drop-parent";
/** DOM marker placed on surfaces that accept a drop at the workspace root. */
export const WORKSPACE_DROP_ROOT_ATTR = "data-workspace-drop-root";

/**
 * What a row or the view needs to render drag state and wire DOM handlers.
 * `dropTargetPath` of `""` means the workspace root.
 */
export interface WorkspaceTreeDrag {
  /** Path of the entry currently being dragged or picked up by keyboard. */
  readonly draggedPath: string | null;
  /** The current drop target, or null when the pointer is over nothing valid. */
  readonly dropTargetPath: string | null;
  /** Whether the current drop target would accept the drag. */
  readonly dropTargetValid: boolean;
  /** Latest `aria-live` announcement for assistive technology. */
  readonly announcement: string;
  /** Main row button `onPointerDown`: starts a pending mouse/pen drag. */
  readonly onRowPointerDown: (event: ReactPointerEvent, entry: NativeWorkspaceEntry) => void;
  /** Drag handle `onPointerDown`: starts a pending touch drag. */
  readonly onHandlePointerDown: (event: ReactPointerEvent, entry: NativeWorkspaceEntry) => void;
  /** Drag handle `onKeyDown`: keyboard pickup/drop/cancel. */
  readonly onHandleKeyDown: (event: ReactKeyboardEvent, entry: NativeWorkspaceEntry) => void;
  /**
   * A row `onClick` calls this first; a completed drag suppresses the
   * click/open the pointerup would otherwise fire.
   */
  readonly consumeSuppressedClick: () => boolean;
  /** Cancels any pending/dragging/keyboard session. */
  readonly cancel: () => void;
}

interface DragSession {
  readonly entry: NativeWorkspaceEntry;
  /**
   * `dropping` is latched while the move awaits: a second Enter or another
   * pointerup must not start a second move for the same gesture.
   */
  phase: "pending" | "dragging" | "keyboard" | "dropping";
  /** Set when `cancel()` runs so a settled-but-cancelled drop skips focus. */
  cancelled: boolean;
  pointerId: number;
  startX: number;
  startY: number;
  pointerTarget: HTMLElement | null;
  moveListener: ((event: PointerEvent) => void) | null;
  upListener: ((event: PointerEvent) => void) | null;
  cancelListener: ((event: PointerEvent) => void) | null;
  keyListener: ((event: KeyboardEvent) => void) | null;
  expandTimer: ReturnType<typeof setTimeout> | null;
  expandTarget: string | null;
  keyboardDestinations: readonly string[] | null;
  keyboardIndex: number;
  suppressClick: boolean;
  /** The page's prior `user-select`, restored exactly on teardown. */
  previousUserSelect: string;
}

function destinationLabel(parentPath: string): string {
  if (!parentPath) return "workspace root";
  return parentPath.split("/").at(-1) ?? parentPath;
}

/**
 * Resolves what is under `(x, y)` to a drop target. Folders win through
 * `WORKSPACE_DROP_PARENT_ATTR`; a file row resolves to an invalid target so
 * it blocks the root fallback; root surfaces resolve to `""`.
 */
function resolveDropTarget(x: number, y: number): { path: string | null; isFile: boolean } {
  const element = typeof document.elementFromPoint === "function"
    ? document.elementFromPoint(x, y)
    : null;
  if (!element) return { path: null, isFile: false };
  const parentTarget = element.closest(`[${WORKSPACE_DROP_PARENT_ATTR}]`);
  if (parentTarget) {
    return { path: parentTarget.getAttribute(WORKSPACE_DROP_PARENT_ATTR) ?? null, isFile: false };
  }
  if (element.closest(`[${WORKSPACE_TREE_ROW_ATTR}]`)) return { path: null, isFile: true };
  if (element.closest(`[${WORKSPACE_DROP_ROOT_ATTR}]`)) return { path: "", isFile: false };
  return { path: null, isFile: false };
}

export function useWorkspaceTreeDrag({
  folderPaths,
  isExpanded,
  expandFolder,
  moveEntry,
  containerRef,
  announce: announceFromHost
}: {
  /** Visible folder paths in tree order — the keyboard destination cycle. */
  readonly folderPaths: readonly string[];
  readonly isExpanded: (path: string) => boolean;
  readonly expandFolder: (path: string) => void;
  readonly moveEntry: (source: NativeWorkspaceEntry, destinationParentPath: string) => Promise<boolean>;
  /** The tree's scroll container, supplied by the host so auto-scroll can reach it. */
  readonly containerRef: RefObject<HTMLUListElement | null>;
  /** Optional host announcement hook (defaults to internal state). */
  readonly announce?: (message: string) => void;
}): WorkspaceTreeDrag {
  const [draggedPath, setDraggedPath] = useState<string | null>(null);
  const [dropTargetPath, setDropTargetPath] = useState<string | null>(null);
  const [dropTargetValid, setDropTargetValid] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const sessionRef = useRef<DragSession | null>(null);
  const suppressedClickRef = useRef(false);
  // Latest callbacks for the session listeners, which outlive one render.
  const handlersRef = useRef({ folderPaths, isExpanded, expandFolder, moveEntry });
  useEffect(() => {
    handlersRef.current = { folderPaths, isExpanded, expandFolder, moveEntry };
  });

  const announce = useCallback((message: string) => {
    setAnnouncement(message);
    announceFromHost?.(message);
  }, [announceFromHost]);

  const setTarget = useCallback((path: string | null, valid: boolean) => {
    setDropTargetPath(path);
    setDropTargetValid(valid && path !== null);
  }, []);

  /** Tears down listeners/timers and restores document styles. */
  const endDomSession = useCallback((session: DragSession) => {
    const target = session.pointerTarget;
    if (session.moveListener) target?.removeEventListener("pointermove", session.moveListener);
    if (session.upListener) target?.removeEventListener("pointerup", session.upListener);
    if (session.cancelListener) target?.removeEventListener("pointercancel", session.cancelListener);
    if (session.keyListener) window.removeEventListener("keydown", session.keyListener, true);
    if (target && session.pointerId >= 0 && typeof target.releasePointerCapture === "function") {
      try {
        target.releasePointerCapture(session.pointerId);
      } catch {
        // Already released by the browser.
      }
    }
    if (session.expandTimer !== null) clearTimeout(session.expandTimer);
    document.body.style.userSelect = session.previousUserSelect;
  }, []);

  const clearVisualState = useCallback(() => {
    setDraggedPath(null);
    setTarget(null, false);
  }, [setTarget]);

  const cancel = useCallback(() => {
    const session = sessionRef.current;
    if (!session) return;
    sessionRef.current = null;
    session.cancelled = true;
    endDomSession(session);
    clearVisualState();
    if (session.phase !== "pending") {
      announce(`Move of ${session.entry.name} cancelled.`);
    }
  }, [announce, clearVisualState, endDomSession]);

  // Cancelling on unmount tears listeners down even if a drag is mid-flight.
  useEffect(() => {
    return () => {
      const session = sessionRef.current;
      if (session) {
        sessionRef.current = null;
        endDomSession(session);
      }
    };
  }, [endDomSession]);

  const updateAutoExpand = useCallback((session: DragSession, path: string | null, valid: boolean) => {
    const target = valid && path ? path : null;
    if (session.expandTarget === target) return;
    session.expandTarget = target;
    if (session.expandTimer !== null) {
      clearTimeout(session.expandTimer);
      session.expandTimer = null;
    }
    if (target && !handlersRef.current.isExpanded(target)) {
      session.expandTimer = setTimeout(() => {
        session.expandTimer = null;
        handlersRef.current.expandFolder(target);
      }, WORKSPACE_DRAG_AUTO_EXPAND_MS);
    }
  }, []);

  const autoScroll = useCallback((clientY: number) => {
    const container = containerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    if (clientY < rect.top + WORKSPACE_DRAG_AUTOSCROLL_EDGE_PX) {
      container.scrollTop -= AUTOSCROLL_STEP_PX;
    } else if (clientY > rect.bottom - WORKSPACE_DRAG_AUTOSCROLL_EDGE_PX) {
      container.scrollTop += AUTOSCROLL_STEP_PX;
    }
  }, [containerRef]);

  const updateTargetAt = useCallback((session: DragSession, x: number, y: number) => {
    const resolved = resolveDropTarget(x, y);
    // A file row is an explicit dead end — it must not fall back to the root.
    const path = resolved.isFile ? null : resolved.path;
    const valid = path !== null && !isInvalidWorkspaceMove(session.entry, path);
    setTarget(path, valid);
    updateAutoExpand(session, path, valid);
    autoScroll(y);
  }, [autoScroll, setTarget, updateAutoExpand]);

  const finishDrop = useCallback(async (session: DragSession, parentPath: string) => {
    // A drop is one-shot: the first release/Enter latches `dropping` and any
    // repeat input during the in-flight move is ignored.
    if (session.phase === "dropping") return;
    session.phase = "dropping";
    const destination = workspaceMoveDestination(session.entry, parentPath);
    announce(`Moving ${session.entry.name} to ${destinationLabel(parentPath)}.`);
    const ok = await handlersRef.current.moveEntry(session.entry, parentPath);
    // The session may have been cancelled while the move was in flight.
    if (sessionRef.current !== session) return;
    sessionRef.current = null;
    clearVisualState();
    if (ok) {
      announce(`Moved ${session.entry.name} to ${destination}.`);
      // Expand a non-root destination so the moved row stays on screen, then
      // land focus on its drag handle once the refresh has rendered it.
      if (parentPath) handlersRef.current.expandFolder(parentPath);
      requestAnimationFrame(() => {
        if (session.cancelled) return;
        const rows = document.querySelectorAll(`[${WORKSPACE_TREE_ROW_ATTR}]`);
        for (const row of rows) {
          if (row.getAttribute(WORKSPACE_TREE_ROW_ATTR) !== destination) continue;
          const handle = row.querySelector<HTMLElement>(`[${WORKSPACE_DRAG_HANDLE_ATTR}]`);
          handle?.focus();
          break;
        }
      });
    } else {
      announce(`Could not move ${session.entry.name}.`);
    }
  }, [announce, clearVisualState]);

  const beginPendingPointer = useCallback((
    event: ReactPointerEvent,
    entry: NativeWorkspaceEntry,
    allowFromRow: boolean
  ) => {
    if (sessionRef.current) return;
    const isTouch = event.pointerType === "touch";
    // Touch drags only ever start from the handle; the row stays scrollable.
    if (isTouch && allowFromRow) return;
    if (event.button !== 0) return;
    const target = event.currentTarget as HTMLElement;
    const session: DragSession = {
      entry,
      phase: "pending",
      cancelled: false,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      pointerTarget: target,
      moveListener: null,
      upListener: null,
      cancelListener: null,
      keyListener: null,
      expandTimer: null,
      expandTarget: null,
      keyboardDestinations: null,
      keyboardIndex: 0,
      suppressClick: false,
      previousUserSelect: document.body.style.userSelect
    };
    sessionRef.current = session;

    try {
      target.setPointerCapture?.(event.pointerId);
    } catch {
      // Synthetic events in tests may not have a capturable pointer.
    }

    session.moveListener = (move: PointerEvent) => {
      if (sessionRef.current !== session) return;
      if (session.phase === "pending") {
        const distance = Math.hypot(move.clientX - session.startX, move.clientY - session.startY);
        if (distance < WORKSPACE_DRAG_THRESHOLD_PX) return;
        session.phase = "dragging";
        session.suppressClick = true;
        document.body.style.userSelect = "none";
        setDraggedPath(session.entry.relative_path);
        announce(`Dragging ${session.entry.name}.`);
      }
      move.preventDefault();
      updateTargetAt(session, move.clientX, move.clientY);
    };
    session.upListener = (up: PointerEvent) => {
      if (sessionRef.current !== session) return;
      if (session.phase === "pending") {
        // A press that never moved is a click, not a drag.
        sessionRef.current = null;
        endDomSession(session);
        return;
      }
      const resolved = resolveDropTarget(up.clientX, up.clientY);
      const path = resolved.isFile ? null : resolved.path;
      const valid = path !== null && !isInvalidWorkspaceMove(session.entry, path);
      endDomSession(session);
      if (session.suppressClick) {
        suppressedClickRef.current = true;
        // The click dispatched after pointerup consumes the flag; a missed
        // click (e.g. pointer released outside) must not eat the next one.
        setTimeout(() => {
          suppressedClickRef.current = false;
        }, 0);
      }
      if (valid && path !== null) {
        void finishDrop(session, path);
      } else {
        sessionRef.current = null;
        clearVisualState();
        if (path === null) {
          announce(`Move of ${session.entry.name} cancelled.`);
        } else if (path === session.entry.parent_path) {
          announce(`${session.entry.name} is already in ${destinationLabel(path)}.`);
        } else {
          // The only other invalid target is the folder's own subtree.
          announce(WORKSPACE_INVALID_MOVE_MESSAGE);
        }
      }
    };
    session.cancelListener = () => cancel();
    session.keyListener = (key: KeyboardEvent) => {
      if (key.key === "Escape") {
        key.preventDefault();
        cancel();
      }
    };
    target.addEventListener("pointermove", session.moveListener);
    target.addEventListener("pointerup", session.upListener);
    target.addEventListener("pointercancel", session.cancelListener);
    window.addEventListener("keydown", session.keyListener, true);
  }, [announce, cancel, clearVisualState, endDomSession, finishDrop, updateTargetAt]);

  const onRowPointerDown = useCallback(
    (event: ReactPointerEvent, entry: NativeWorkspaceEntry) => beginPendingPointer(event, entry, true),
    [beginPendingPointer]
  );
  const onHandlePointerDown = useCallback(
    (event: ReactPointerEvent, entry: NativeWorkspaceEntry) => beginPendingPointer(event, entry, false),
    [beginPendingPointer]
  );

  const onHandleKeyDown = useCallback((event: ReactKeyboardEvent, entry: NativeWorkspaceEntry) => {
    const existing = sessionRef.current;
    const key = event.key;

    if (!existing) {
      if (key !== "Enter" && key !== " ") return;
      event.preventDefault();
      event.stopPropagation();
      const destinations = ["", ...handlersRef.current.folderPaths].filter(
        (parentPath) => !isInvalidWorkspaceMove(entry, parentPath)
      );
      if (destinations.length === 0) {
        announce(`No destination is available for ${entry.name}.`);
        return;
      }
      const session: DragSession = {
        entry,
        phase: "keyboard",
        cancelled: false,
        pointerId: -1,
        startX: 0,
        startY: 0,
        pointerTarget: null,
        moveListener: null,
        upListener: null,
        cancelListener: null,
        keyListener: null,
        expandTimer: null,
        expandTarget: null,
        keyboardDestinations: destinations,
        keyboardIndex: 0,
        suppressClick: false,
        previousUserSelect: document.body.style.userSelect
      };
      sessionRef.current = session;
      setDraggedPath(entry.relative_path);
      const first = destinations[0] ?? "";
      setTarget(first, true);
      announce(
        `Picked up ${entry.name}. Destination: ${destinationLabel(first)}. ` +
        "Use the arrow keys to change it, Enter to drop, Escape to cancel."
      );
      return;
    }

    if (existing.phase !== "keyboard" || existing.entry.relative_path !== entry.relative_path) return;
    const destinations = existing.keyboardDestinations ?? [];
    if (key === "ArrowDown" || key === "ArrowUp") {
      event.preventDefault();
      event.stopPropagation();
      if (destinations.length === 0) return;
      const delta = key === "ArrowDown" ? 1 : -1;
      existing.keyboardIndex = (existing.keyboardIndex + delta + destinations.length) % destinations.length;
      const current = destinations[existing.keyboardIndex] ?? "";
      setTarget(current, true);
      announce(`Destination: ${destinationLabel(current)}.`);
    } else if (key === "Enter" || key === " ") {
      event.preventDefault();
      event.stopPropagation();
      const current = destinations[existing.keyboardIndex] ?? "";
      void finishDrop(existing, current);
    } else if (key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      cancel();
    }
  }, [announce, cancel, finishDrop, setTarget]);

  const consumeSuppressedClick = useCallback(() => {
    const suppressed = suppressedClickRef.current;
    suppressedClickRef.current = false;
    return suppressed;
  }, []);

  return {
    draggedPath,
    dropTargetPath,
    dropTargetValid,
    announcement,
    onRowPointerDown,
    onHandlePointerDown,
    onHandleKeyDown,
    consumeSuppressedClick,
    cancel
  };
}
