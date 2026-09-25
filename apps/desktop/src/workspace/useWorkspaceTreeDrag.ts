/**
 * Pointer/keyboard drag-and-drop controller for the workspace tree.
 *
 * One instance is created in `WorkspaceExplorerView` and passed down to every
 * row. Mouse/pen use Pointer Events; delayed Android row gestures use Touch
 * Events because the browser owns panning until JavaScript prevents it. This
 * never uses the HTML5 drag API, which is unreliable in Android WebViews.
 *
 * Gesture rules:
 * - Mouse/pen drags start from the row's main button on the primary button,
 *   after a small movement threshold so plain clicks never become drags.
 * - Touch drags can start from the dedicated handle immediately, or from the
 *   whole row after a press-and-hold. The row path uses Touch Events because
 *   Pointer Events cannot take a pan gesture back from the browser once
 *   scrolling becomes possible; delaying `preventDefault` until the hold has
 *   elapsed preserves normal swipes, taps, and the context menu.
 * - A floating preview follows the pointer while the source row stays dimmed.
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
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
  type TouchEvent as ReactTouchEvent
} from "react";
import type { NativeWorkspaceEntry } from "../native/commands";
import {
  isInvalidWorkspaceMove,
  WORKSPACE_INVALID_MOVE_MESSAGE,
  workspaceMoveDestination
} from "./workspaceMove";

/** Distance in px a mouse/pen must travel before a press becomes a drag. */
export const WORKSPACE_DRAG_THRESHOLD_PX = 6;
/** Touch hold time before a row can be dragged instead of opened. */
export const WORKSPACE_TOUCH_DRAG_HOLD_MS = 350;
/** Movement before that hold means the gesture belongs to the scroller. */
export const WORKSPACE_TOUCH_SCROLL_SLOP_PX = 12;
/** Movement after the hold turns the lifted row into an active drag. */
export const WORKSPACE_TOUCH_DRAG_SLOP_PX = 6;
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
/** DOM marker on the floating drag preview; pointer-transparent by design. */
export const WORKSPACE_DRAG_PREVIEW_ATTR = "data-workspace-drag-preview";

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
  /** Main row `onTouchStart`: arms hold-to-drag without stealing scrolling. */
  readonly onRowTouchStart: (event: ReactTouchEvent, entry: NativeWorkspaceEntry) => void;
  /** Drag handle `onPointerDown`: starts a pending pointer drag. */
  readonly onHandlePointerDown: (event: ReactPointerEvent, entry: NativeWorkspaceEntry) => void;
  /** Returns true when an active touch session owns/suppresses contextmenu. */
  readonly onRowContextMenu: (event: ReactMouseEvent, entry: NativeWorkspaceEntry) => boolean;
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
   * pointerup/touchend must not start a second move for the same gesture.
   * `touch-ready` means the hold elapsed but the finger has not moved yet;
   * releasing there opens the context menu rather than dropping.
   */
  phase: "pending" | "touch-ready" | "dragging" | "keyboard" | "dropping";
  /** Set when `cancel()` runs so a settled-but-cancelled drop skips focus. */
  cancelled: boolean;
  readonly inputKind: "pointer" | "touch" | "keyboard";
  readonly pointerType: string;
  pointerId: number;
  startX: number;
  startY: number;
  lastX: number;
  lastY: number;
  pointerTarget: HTMLElement | null;
  moveListener: EventListener | null;
  upListener: EventListener | null;
  cancelListener: EventListener | null;
  keyListener: ((event: KeyboardEvent) => void) | null;
  expandTimer: ReturnType<typeof setTimeout> | null;
  holdTimer: ReturnType<typeof setTimeout> | null;
  expandTarget: string | null;
  keyboardDestinations: readonly string[] | null;
  keyboardIndex: number;
  suppressClick: boolean;
  contextMenuOpened: boolean;
  previewElement: HTMLElement | null;
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

function touchById(event: TouchEvent, identifier: number): Touch | null {
  return Array.from(event.changedTouches).find((touch) => touch.identifier === identifier) ?? null;
}

/**
 * Clones the row's icon/name into a fixed ghost. It is updated imperatively
 * because React state on every pointermove would re-render the entire tree.
 */
function ensureDragPreview(session: DragSession, x: number, y: number): void {
  if (!session.previewElement) {
    const row = session.pointerTarget?.closest(`[${WORKSPACE_TREE_ROW_ATTR}]`);
    const source = row?.querySelector<HTMLElement>("button");
    const preview = document.createElement("div");
    preview.setAttribute(WORKSPACE_DRAG_PREVIEW_ATTR, "");
    preview.setAttribute("aria-hidden", "true");
    preview.className =
      "pointer-events-none fixed left-0 top-0 z-[100] flex max-w-64 items-center gap-1.5 overflow-hidden rounded-small border border-border bg-popover px-2 py-1 text-popover-foreground text-xs shadow-soft";
    if (source) {
      for (const child of Array.from(source.childNodes)) {
        preview.append(child.cloneNode(true));
      }
    } else {
      preview.textContent = session.entry.name;
    }
    document.body.append(preview);
    session.previewElement = preview;
  }
  session.previewElement.style.transform = `translate3d(${x + 12}px, ${y - 14}px, 0)`;
}

export function useWorkspaceTreeDrag({
  folderPaths,
  isExpanded,
  expandFolder,
  moveEntry,
  openContextMenu,
  containerRef,
  announce: announceFromHost
}: {
  /** Visible folder paths in tree order — the keyboard destination cycle. */
  readonly folderPaths: readonly string[];
  readonly isExpanded: (path: string) => boolean;
  readonly expandFolder: (path: string) => void;
  readonly moveEntry: (source: NativeWorkspaceEntry, destinationParentPath: string) => Promise<boolean>;
  /** Opens the row's existing context menu after a stationary touch hold. */
  readonly openContextMenu?: (entry: NativeWorkspaceEntry, x: number, y: number) => void;
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
  const handlersRef = useRef({ folderPaths, isExpanded, expandFolder, moveEntry, openContextMenu });
  useEffect(() => {
    handlersRef.current = { folderPaths, isExpanded, expandFolder, moveEntry, openContextMenu };
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
    const moveEvent = session.inputKind === "touch" ? "touchmove" : "pointermove";
    const upEvent = session.inputKind === "touch" ? "touchend" : "pointerup";
    const cancelEvent = session.inputKind === "touch" ? "touchcancel" : "pointercancel";
    if (session.moveListener) target?.removeEventListener(moveEvent, session.moveListener);
    if (session.upListener) target?.removeEventListener(upEvent, session.upListener);
    if (session.cancelListener) target?.removeEventListener(cancelEvent, session.cancelListener);
    if (session.keyListener) window.removeEventListener("keydown", session.keyListener, true);
    if (
      session.inputKind === "pointer" &&
      target &&
      session.pointerId >= 0 &&
      typeof target.releasePointerCapture === "function"
    ) {
      try {
        target.releasePointerCapture(session.pointerId);
      } catch {
        // Already released by the browser.
      }
    }
    if (session.expandTimer !== null) clearTimeout(session.expandTimer);
    if (session.holdTimer !== null) clearTimeout(session.holdTimer);
    session.previewElement?.remove();
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

  const suppressNextClick = useCallback(() => {
    suppressedClickRef.current = true;
    // The click dispatched after release consumes the flag; a missed click
    // (e.g. pointer released outside) must not eat the next one.
    setTimeout(() => {
      suppressedClickRef.current = false;
    }, 0);
  }, []);

  const activateDrag = useCallback((session: DragSession, x: number, y: number) => {
    session.phase = "dragging";
    session.suppressClick = true;
    document.body.style.userSelect = "none";
    setDraggedPath(session.entry.relative_path);
    ensureDragPreview(session, x, y);
    announce(`Dragging ${session.entry.name}.`);
  }, [announce]);

  const completeDrop = useCallback((session: DragSession, x: number, y: number) => {
    const resolved = resolveDropTarget(x, y);
    const path = resolved.isFile ? null : resolved.path;
    const valid = path !== null && !isInvalidWorkspaceMove(session.entry, path);
    endDomSession(session);
    if (session.suppressClick) suppressNextClick();
    if (valid && path !== null) {
      void finishDrop(session, path);
      return;
    }
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
  }, [announce, clearVisualState, endDomSession, finishDrop, suppressNextClick]);

  const beginPendingPointer = useCallback((
    event: ReactPointerEvent,
    entry: NativeWorkspaceEntry,
    allowFromRow: boolean
  ) => {
    if (sessionRef.current) return;
    // Row touches use the delayed Touch Events path below; the handle keeps a
    // responsive pointer drag because it is outside the browser's scroll path.
    if (event.pointerType === "touch" && allowFromRow) return;
    if (event.button !== 0) return;
    const target = event.currentTarget as HTMLElement;
    const session: DragSession = {
      entry,
      phase: "pending",
      cancelled: false,
      inputKind: "pointer",
      pointerType: event.pointerType,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      lastX: event.clientX,
      lastY: event.clientY,
      pointerTarget: target,
      moveListener: null,
      upListener: null,
      cancelListener: null,
      keyListener: null,
      expandTimer: null,
      holdTimer: null,
      expandTarget: null,
      keyboardDestinations: null,
      keyboardIndex: 0,
      suppressClick: false,
      contextMenuOpened: false,
      previewElement: null,
      previousUserSelect: document.body.style.userSelect
    };
    sessionRef.current = session;

    try {
      target.setPointerCapture?.(event.pointerId);
    } catch {
      // Synthetic events in tests may not have a capturable pointer.
    }

    session.moveListener = (event: Event) => {
      if (sessionRef.current !== session) return;
      const move = event as PointerEvent;
      session.lastX = move.clientX;
      session.lastY = move.clientY;
      if (session.phase === "pending") {
        const distance = Math.hypot(move.clientX - session.startX, move.clientY - session.startY);
        if (distance < WORKSPACE_DRAG_THRESHOLD_PX) return;
        activateDrag(session, move.clientX, move.clientY);
      }
      move.preventDefault();
      ensureDragPreview(session, move.clientX, move.clientY);
      updateTargetAt(session, move.clientX, move.clientY);
    };
    session.upListener = (event: Event) => {
      if (sessionRef.current !== session) return;
      const up = event as PointerEvent;
      if (session.phase === "pending") {
        // A press that never moved is a click, not a drag.
        sessionRef.current = null;
        endDomSession(session);
        return;
      }
      completeDrop(session, up.clientX, up.clientY);
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
  }, [activateDrag, cancel, completeDrop, endDomSession, updateTargetAt]);

  /**
   * Row touches stay browser-owned until the hold proves intent. Early motion
   * scrolls; motion after the hold becomes a drag; a stationary release after
   * the hold opens the row's ordinary context menu.
   */
  const beginTouchCandidate = useCallback((event: ReactTouchEvent, entry: NativeWorkspaceEntry) => {
    if (sessionRef.current || event.touches.length !== 1) return;
    const touch = event.changedTouches[0];
    if (!touch) return;
    const target = event.currentTarget as HTMLElement;
    const session: DragSession = {
      entry,
      phase: "pending",
      cancelled: false,
      inputKind: "touch",
      pointerType: "touch",
      pointerId: touch.identifier,
      startX: touch.clientX,
      startY: touch.clientY,
      lastX: touch.clientX,
      lastY: touch.clientY,
      pointerTarget: target,
      moveListener: null,
      upListener: null,
      cancelListener: null,
      keyListener: null,
      expandTimer: null,
      holdTimer: null,
      expandTarget: null,
      keyboardDestinations: null,
      keyboardIndex: 0,
      suppressClick: false,
      contextMenuOpened: false,
      previewElement: null,
      previousUserSelect: document.body.style.userSelect
    };
    sessionRef.current = session;

    session.holdTimer = setTimeout(() => {
      if (sessionRef.current !== session || session.phase !== "pending") return;
      session.phase = "touch-ready";
      document.body.style.userSelect = "none";
      setDraggedPath(entry.relative_path);
      ensureDragPreview(session, session.lastX, session.lastY);
      announce(`Move ${entry.name}. Move to choose a destination, or lift for actions.`);
    }, WORKSPACE_TOUCH_DRAG_HOLD_MS);

    session.moveListener = (event: Event) => {
      if (sessionRef.current !== session) return;
      const move = event as TouchEvent;
      if (move.touches.length !== 1) {
        cancel();
        return;
      }
      const current = touchById(move, session.pointerId);
      if (!current) return;
      session.lastX = current.clientX;
      session.lastY = current.clientY;
      const distance = Math.hypot(current.clientX - session.startX, current.clientY - session.startY);

      if (session.phase === "pending") {
        // Movement before the hold belongs to the browser's scroller.
        if (distance > WORKSPACE_TOUCH_SCROLL_SLOP_PX) {
          sessionRef.current = null;
          endDomSession(session);
        }
        return;
      }

      // Once the hold has elapsed, this gesture is ours; do not let the
      // browser resume panning or open text-selection UI underneath it.
      move.preventDefault();
      ensureDragPreview(session, current.clientX, current.clientY);
      if (session.phase === "touch-ready") {
        if (distance < WORKSPACE_TOUCH_DRAG_SLOP_PX) return;
        session.phase = "dragging";
        session.suppressClick = true;
        announce(`Dragging ${session.entry.name}.`);
      }
      updateTargetAt(session, current.clientX, current.clientY);
    };

    const openHeldMenu = () => {
      if (session.contextMenuOpened) return;
      session.contextMenuOpened = true;
      handlersRef.current.openContextMenu?.(entry, session.lastX, session.lastY);
    };

    session.upListener = (event: Event) => {
      if (sessionRef.current !== session) return;
      const up = event as TouchEvent;
      const current = touchById(up, session.pointerId);
      if (current) {
        session.lastX = current.clientX;
        session.lastY = current.clientY;
      }
      if (session.phase === "pending") {
        // A short touch remains a normal tap/click.
        sessionRef.current = null;
        endDomSession(session);
        return;
      }
      if (session.phase === "touch-ready") {
        up.preventDefault();
        session.suppressClick = true;
        sessionRef.current = null;
        endDomSession(session);
        clearVisualState();
        suppressNextClick();
        openHeldMenu();
        return;
      }
      completeDrop(session, session.lastX, session.lastY);
    };
    session.cancelListener = () => {
      if (sessionRef.current !== session) return;
      if (session.phase === "touch-ready") {
        // Some WebViews cancel the touch stream after firing contextmenu.
        sessionRef.current = null;
        endDomSession(session);
        clearVisualState();
        openHeldMenu();
        return;
      }
      cancel();
    };
    session.keyListener = (key: KeyboardEvent) => {
      if (key.key === "Escape") {
        key.preventDefault();
        cancel();
      }
    };
    target.addEventListener("touchmove", session.moveListener, { passive: false });
    target.addEventListener("touchend", session.upListener, { passive: false });
    target.addEventListener("touchcancel", session.cancelListener);
    window.addEventListener("keydown", session.keyListener, true);
  }, [announce, cancel, clearVisualState, completeDrop, endDomSession, suppressNextClick, updateTargetAt]);

  const onRowPointerDown = useCallback(
    (event: ReactPointerEvent, entry: NativeWorkspaceEntry) => beginPendingPointer(event, entry, true),
    [beginPendingPointer]
  );
  const onRowTouchStart = useCallback(
    (event: ReactTouchEvent, entry: NativeWorkspaceEntry) => beginTouchCandidate(event, entry),
    [beginTouchCandidate]
  );
  const onHandlePointerDown = useCallback(
    (event: ReactPointerEvent, entry: NativeWorkspaceEntry) => beginPendingPointer(event, entry, false),
    [beginPendingPointer]
  );
  const onRowContextMenu = useCallback((event: ReactMouseEvent, entry: NativeWorkspaceEntry) => {
    const session = sessionRef.current;
    const ownsTouchContext =
      session?.entry.relative_path === entry.relative_path &&
      (session.inputKind === "touch" || session.pointerType === "touch");
    if (!ownsTouchContext) return false;
    // The app owns long-press while a row touch is deciding between scroll,
    // drag, and menu. Releasing without movement opens the menu manually.
    event.preventDefault();
    event.stopPropagation();
    return true;
  }, []);

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
        inputKind: "keyboard",
        pointerType: "keyboard",
        pointerId: -1,
        startX: 0,
        startY: 0,
        lastX: 0,
        lastY: 0,
        pointerTarget: null,
        moveListener: null,
        upListener: null,
        cancelListener: null,
        keyListener: null,
        expandTimer: null,
        holdTimer: null,
        expandTarget: null,
        keyboardDestinations: destinations,
        keyboardIndex: 0,
        suppressClick: false,
        contextMenuOpened: false,
        previewElement: null,
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
    onRowTouchStart,
    onHandlePointerDown,
    onRowContextMenu,
    onHandleKeyDown,
    consumeSuppressedClick,
    cancel
  };
}
