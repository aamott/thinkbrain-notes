import { useCallback, useRef, useState, type Dispatch, type RefObject, type SetStateAction } from "react";
import { workspaceErrorMessage, type WorkspaceExplorerState } from "./workspaceExplorerModel";
import type { WorkspaceDesktopApi } from "./workspaceAdapter";
import {
  joinPath,
  isMarkdownName,
  isNewNoteCreate,
  isValidFolderPath,
  isValidName,
  type CreateState,
  type PendingExtensionConfirm
} from "./workspaceExplorerTypes";

interface UseWorkspaceInlineCreateOptions {
  readonly stateRef: RefObject<WorkspaceExplorerState>;
  readonly rootPathRef: RefObject<string | undefined>;
  readonly apiRef: RefObject<WorkspaceDesktopApi>;
  readonly runWithRefresh: (operation: () => Promise<unknown>, options?: { selectMarkdown?: string }) => Promise<boolean>;
  readonly setActionError: Dispatch<SetStateAction<string | null>>;
  readonly closeContextMenu: () => void;
  readonly expandFolder: (relativePath: string) => void;
}

/**
 * The explorer's inline create draft and the non-Markdown confirmation that
 * can interrupt a New note before it is created.
 */
export function useWorkspaceInlineCreate({
  stateRef,
  rootPathRef,
  apiRef,
  runWithRefresh,
  setActionError,
  closeContextMenu,
  expandFolder
}: UseWorkspaceInlineCreateOptions) {
  const [creating, setCreating] = useState<CreateState | null>(null);
  const [pendingExtensionConfirm, setPendingExtensionConfirm] = useState<PendingExtensionConfirm | null>(null);
  const [inlineCreateError, setInlineCreateError] = useState<string | null>(null);
  const [extensionConfirmError, setExtensionConfirmError] = useState<string | null>(null);

  // While the non-Markdown confirmation is open the inline create input loses
  // focus to the dialog; its blur-must-cancel rule must not fire or the draft
  // it asks about would be unmounted mid-question.
  const suppressInlineCancelRef = useRef(false);
  const createFocusRequestRef = useRef(0);
  // Identifies the confirmation currently creating. Object identity blocks a
  // double tap without letting an older workspace operation block a new one.
  const extensionCreateInFlightRef = useRef<PendingExtensionConfirm | null>(null);

  /** Drops the draft and any confirmation when the workspace changes. */
  const resetCreate = useCallback(() => {
    setCreating(null);
    setPendingExtensionConfirm(null);
    setInlineCreateError(null);
    setExtensionConfirmError(null);
    suppressInlineCancelRef.current = false;
  }, []);

  /** Opens the New note draft at the workspace root. */
  const focusNewNote = useCallback(() => {
    setInlineCreateError(null);
    createFocusRequestRef.current += 1;
    setCreating({ parentPath: "", kind: "file", source: "new-note", focusRequest: createFocusRequestRef.current });
  }, []);

  const submitCreate = useCallback(async (target: CreateState, name: string): Promise<boolean> => {
    const rootPath = stateRef.current.snapshot?.workspace.root_path;
    if (!rootPath) return false;
    const trimmed = name.trim();
    const isNote = isNewNoteCreate(target);
    // A New note never cancels silently: an empty or extension-only draft is a
    // mistake worth naming inline rather than a dismissal.
    if (isNote && !trimmed) {
      setInlineCreateError("Give your note a name.");
      return false;
    }
    if (isNote) {
      const extensionOnly = /^\.(md|markdown)$/i.test(trimmed);
      if (extensionOnly) {
        setInlineCreateError(`Give your note a name before ${trimmed.toLowerCase()}.`);
        return false;
      }
    }
    if (!trimmed) {
      setCreating(null);
      return true;
    }
    setInlineCreateError(null);
    // Folders may use forward-slash-separated nested paths (e.g. `a/b/c`)
    // since the backend creates intermediate directories via `create_dir_all`.
    // Files still reject path separators so a single leaf entry is produced.
    if (target.kind === "folder") {
      if (!isValidFolderPath(trimmed)) {
        setActionError("Folder paths cannot contain '\\' or empty/`.`/`..` segments.");
        return false;
      }
    } else if (!isValidName(trimmed)) {
      setActionError("Names cannot contain path separators (/ or \\).");
      return false;
    }
    // Notes must end in `.md`/`.markdown`. Anything else is a deliberate file
    // type choice, so it is confirmed — never created — before running.
    if (isNote && !isMarkdownName(trimmed)) {
      suppressInlineCancelRef.current = true;
      setPendingExtensionConfirm({ target, name: trimmed });
      return false;
    }
    const relativePath = joinPath(target.parentPath, trimmed);
    const ok = await runWithRefresh(async () => {
      if (target.kind === "file") {
        await apiRef.current.createWorkspaceFile(rootPath, relativePath);
      } else {
        await apiRef.current.createWorkspaceFolder(rootPath, relativePath);
      }
    }, { selectMarkdown: target.kind === "file" && isMarkdownName(trimmed) ? relativePath : undefined });
    // Clear the inline input only on success; keep it open on failure so
    // the user can correct the name and retry.
    if (ok) setCreating(null);
    return ok;
  }, [apiRef, runWithRefresh, setActionError, stateRef]);

  /**
   * Every safe dismissal of the extension confirmation — Escape, scrim,
   * Android Back, the Keep editing button — returns to the inline draft. The
   * input was never unmounted, so nothing about the draft was lost.
   */
  const dismissExtensionConfirm = useCallback(() => {
    if (pendingExtensionConfirm && extensionCreateInFlightRef.current === pendingExtensionConfirm) return;
    suppressInlineCancelRef.current = false;
    setPendingExtensionConfirm(null);
    setExtensionConfirmError(null);
  }, [pendingExtensionConfirm]);

  /**
   * Runs the saved, already-validated name through the same create/refresh
   * path — exactly once per confirmation. A non-Markdown result is never
   * selected as a note, and a failure keeps the dialog open for retry.
   */
  const confirmExtensionCreate = useCallback(async (): Promise<void> => {
    const pending = pendingExtensionConfirm;
    const rootPath = stateRef.current.snapshot?.workspace.root_path;
    if (!pending || !rootPath || extensionCreateInFlightRef.current === pending) return;
    extensionCreateInFlightRef.current = pending;
    setExtensionConfirmError(null);
    let message = "The file could not be created.";
    try {
      const relativePath = joinPath(pending.target.parentPath, pending.name);
      const ok = await runWithRefresh(async () => {
        try {
          await apiRef.current.createWorkspaceFile(rootPath, relativePath);
        } catch (error) {
          message = workspaceErrorMessage(error);
          throw error;
        }
      });
      if (rootPathRef.current !== rootPath) return;
      if (ok) {
        suppressInlineCancelRef.current = false;
        setPendingExtensionConfirm((current) => current === pending ? null : current);
        setCreating((current) => current === pending.target ? null : current);
      } else {
        setExtensionConfirmError(message);
      }
    } finally {
      if (extensionCreateInFlightRef.current === pending) extensionCreateInFlightRef.current = null;
    }
  }, [apiRef, pendingExtensionConfirm, rootPathRef, runWithRefresh, stateRef]);

  const startCreate = useCallback((parentPath: string, kind: "file" | "folder", source: "new-file" | "new-note" = "new-file") => {
    closeContextMenu();
    // Expand the target folder so the inline input is visible. Creating at the
    // workspace root (empty parentPath) needs no expansion.
    if (parentPath) expandFolder(parentPath);
    setInlineCreateError(null);
    createFocusRequestRef.current += 1;
    const focusRequest = createFocusRequestRef.current;
    setCreating(
      kind === "file"
        ? { parentPath, kind, source, focusRequest }
        : { parentPath, kind, focusRequest }
    );
  }, [closeContextMenu, expandFolder]);

  // The blur-cancel path in InlineNameInput reaches the explorer through this
  // setter. While the extension confirmation holds the draft open, a null
  // write is the blur talking — not a real cancel.
  const setCreatingGuarded = useCallback((value: CreateState | null) => {
    if (value === null && suppressInlineCancelRef.current) return;
    if (value === null) setInlineCreateError(null);
    setCreating(value);
  }, []);

  return {
    creating,
    pendingExtensionConfirm,
    inlineCreateError,
    extensionConfirmError,
    setInlineCreateError,
    resetCreate,
    focusNewNote,
    submitCreate,
    dismissExtensionConfirm,
    confirmExtensionCreate,
    startCreate,
    setCreatingGuarded
  };
}
