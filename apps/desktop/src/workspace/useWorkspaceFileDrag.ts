/**
 * HTML5 drag-and-drop controller for the workspace tree — the desktop half of
 * dragging. The pointer/touch controller in `useWorkspaceTreeDrag` cannot
 * leave the webview: a custom pointermove drag ends at the window edge, so it
 * can never hand a file to a system file manager. This hook uses the browser's
 * native drag API, which the OS carries across application boundaries.
 *
 * Enabled on fine-pointer devices only (`(pointer: fine)`): Android and touch
 * rows keep the custom gesture path, where the browser's HTML5 drag is
 * unreliable. When enabled, `useWorkspaceTreeDrag` is told to ignore
 * mouse/pen presses so the two systems never compete for one gesture.
 *
 * Payloads written on dragstart:
 * - `text/uri-list` — `file://` URIs, accepted as a file drop by X11 and
 *   Wayland file managers (Nautilus, Nemo, Dolphin…).
 * - `DownloadURL` — Chromium's "download a copy" drag format; Windows
 *   Explorer (WebView2) accepts it as a file copy. Files only — a directory
 *   is not downloadable.
 * - `WORKSPACE_TREE_DRAG_TYPE` — an app-internal marker carrying the
 *   workspace-relative path, so internal drops distinguish our drags from
 *   files dragged in from the OS (which the tree does not yet import).
 */
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type DragEvent as ReactDragEvent,
  type RefObject
} from "react";
import type { NativeWorkspaceEntry } from "../native/commands";
import {
  createAutoExpand,
  edgeAutoScroll,
  invalidMoveMessage,
  isInvalidWorkspaceMove,
  runWorkspaceMove
} from "./workspaceMove";

/** Internal dataTransfer type marking a workspace-tree drag. */
export const WORKSPACE_TREE_DRAG_TYPE = "application/x-thinkbrain-tree";

/** HTML5 drag handlers + state the tree rows and root surface consume. */
export interface WorkspaceFileDrag {
  /** Whether rows should render `draggable` and arm HTML5 drags. */
  readonly enabled: boolean;
  readonly draggedPath: string | null;
  readonly dropTargetPath: string | null;
  readonly dropTargetValid: boolean;
  readonly announcement: string;
  readonly onRowDragStart: (event: ReactDragEvent, entry: NativeWorkspaceEntry) => void;
  readonly onRowDragOver: (event: ReactDragEvent, entry: NativeWorkspaceEntry) => void;
  readonly onRowDragLeave: (event: ReactDragEvent, entry: NativeWorkspaceEntry) => void;
  readonly onRowDrop: (event: ReactDragEvent, entry: NativeWorkspaceEntry) => void;
  readonly onDragEnd: (event: ReactDragEvent) => void;
  readonly onRootDragOver: (event: ReactDragEvent) => void;
  readonly onRootDrop: (event: ReactDragEvent) => void;
  readonly cancel: () => void;
}

/** RFC 2483 file URI — each path segment is escaped individually. */
function fileUri(absolutePath: string): string {
  return "file://" + absolutePath.split("/").map(encodeURIComponent).join("/");
}

function isFinePointer(): boolean {
  return typeof window !== "undefined" && window.matchMedia?.("(pointer: fine)").matches === true;
}

export function useWorkspaceFileDrag({
  rootPath,
  isExpanded,
  expandFolder,
  moveEntry,
  containerRef
}: {
  /** Workspace root — needed to hand absolute paths to the OS. */
  readonly rootPath: string | null;
  readonly isExpanded: (path: string) => boolean;
  readonly expandFolder: (path: string) => void;
  readonly moveEntry: (source: NativeWorkspaceEntry, destinationParentPath: string) => Promise<boolean>;
  readonly containerRef: RefObject<HTMLElement | null>;
}): WorkspaceFileDrag {
  const [enabled] = useState(isFinePointer);
  const [draggedPath, setDraggedPath] = useState<string | null>(null);
  const [dropTargetPath, setDropTargetPath] = useState<string | null>(null);
  const [dropTargetValid, setDropTargetValid] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const draggedEntryRef = useRef<NativeWorkspaceEntry | null>(null);
  const lastHoverRef = useRef<{ path: string | null; valid: boolean }>({
    path: null,
    valid: false
  });
  // Latest callbacks for the expand timer, which outlives one render.
  const handlersRef = useRef({ isExpanded, expandFolder, moveEntry });
  useEffect(() => {
    handlersRef.current = { isExpanded, expandFolder, moveEntry };
  });
  const [autoExpand] = useState(createAutoExpand);
  const say = setAnnouncement;

  const clear = useCallback(() => {
    draggedEntryRef.current = null;
    lastHoverRef.current = { path: null, valid: false };
    setDraggedPath(null);
    setDropTargetPath(null);
    setDropTargetValid(false);
    autoExpand.clear();
  }, [autoExpand]);

  /** Validates + tracks `target` (`""` is the workspace root). */
  const trackTarget = useCallback((
    event: ReactDragEvent,
    target: string | null
  ) => {
    const dragged = draggedEntryRef.current;
    if (!dragged || target === null) {
      // Not our drag — leave the default not-allowed cursor.
      return;
    }
    const valid = !isInvalidWorkspaceMove(dragged, target);
    setDropTargetPath(target);
    setDropTargetValid(valid);
    // Invalid drops never reach a drop event — the not-allowed cursor is the
    // only feedback, so the rejection is announced while hovering instead.
    if (!valid && lastHoverRef.current.path !== target) {
      say(invalidMoveMessage(dragged, target));
    }
    lastHoverRef.current = { path: target, valid };
    autoExpand.update(target, valid, handlersRef.current);
    edgeAutoScroll(containerRef.current, event.clientY);
    if (valid) {
      // preventDefault is what makes a drop allowed on this element.
      event.preventDefault();
      event.dataTransfer.dropEffect = "move";
    } else {
      event.dataTransfer.dropEffect = "none";
    }
  }, [autoExpand, containerRef, say]);

  const onRowDragStart = useCallback((event: ReactDragEvent, entry: NativeWorkspaceEntry) => {
    draggedEntryRef.current = entry;
    setDraggedPath(entry.relative_path);
    const dt = event.dataTransfer;
    dt.setData(WORKSPACE_TREE_DRAG_TYPE, entry.relative_path);
    if (rootPath) {
      const uri = fileUri(`${rootPath}/${entry.relative_path}`);
      dt.setData("text/uri-list", uri);
      if (entry.kind === "file") {
        dt.setData("DownloadURL", `application/octet-stream:${entry.name}:${uri}`);
      }
    }
    dt.effectAllowed = "copyMove";
    say(`Dragging ${entry.name}.`);
  }, [rootPath, say]);

  const onRowDragOver = useCallback((event: ReactDragEvent, entry: NativeWorkspaceEntry) => {
    // Rows own their dragover — without stopPropagation the event would
    // bubble to the root surface and turn every row into a root drop.
    event.stopPropagation();
    if (entry.kind !== "directory") {
      // A file row is an explicit dead end, matching the pointer path: the
      // target clears rather than falling back to the workspace root.
      setDropTargetPath(null);
      setDropTargetValid(false);
      autoExpand.clear();
      event.dataTransfer.dropEffect = "none";
      return;
    }
    trackTarget(event, entry.relative_path);
  }, [autoExpand, trackTarget]);

  const onRowDragLeave = useCallback((_event: ReactDragEvent, entry: NativeWorkspaceEntry) => {
    if (dropTargetPath === entry.relative_path) {
      setDropTargetPath(null);
      setDropTargetValid(false);
      autoExpand.clear();
    }
  }, [autoExpand, dropTargetPath]);

  const finish = useCallback((target: string) => {
    const dragged = draggedEntryRef.current;
    if (!dragged || isInvalidWorkspaceMove(dragged, target)) {
      clear();
      return;
    }
    void runWorkspaceMove(
      dragged,
      target,
      handlersRef.current.moveEntry,
      handlersRef.current.expandFolder,
      say
    );
    clear();
  }, [clear, say]);

  const onRowDrop = useCallback((event: ReactDragEvent, entry: NativeWorkspaceEntry) => {
    if (entry.kind !== "directory") return;
    event.stopPropagation();
    event.preventDefault();
    finish(entry.relative_path);
  }, [finish]);

  const onRootDragOver = useCallback((event: ReactDragEvent) => {
    // Reached only when the pointer is off every row — rows stopPropagation.
    trackTarget(event, "");
  }, [trackTarget]);

  const onRootDrop = useCallback((event: ReactDragEvent) => {
    event.preventDefault();
    finish("");
  }, [finish]);

  const onDragEnd = useCallback(() => {
    clear();
  }, [clear]);

  const cancel = useCallback(() => {
    if (draggedEntryRef.current) {
      say(`Move of ${draggedEntryRef.current.name} cancelled.`);
    }
    clear();
  }, [clear, say]);

  return {
    enabled,
    draggedPath,
    dropTargetPath,
    dropTargetValid,
    announcement,
    onRowDragStart,
    onRowDragOver,
    onRowDragLeave,
    onRowDrop,
    onDragEnd,
    onRootDragOver,
    onRootDrop,
    cancel
  };
}
