/**
 * The open documents: their text, their disk anchor, and every edit to them.
 *
 * Split out of `DesktopShell` because it is state with rules, not composition.
 * A tab is a handle; this is what is behind it — the text on screen, the text
 * the file last agreed with, and the seven operations that move between them.
 * Keeping them together is the point: every one of them has to leave the view
 * and the tab's dirty flag consistent, and that is easier to hold in one file
 * than spread across the shell.
 *
 * The pure decisions live in `externalDocumentSync.ts` and stay there. This
 * hook owns the state those functions transform, and the effects that run them.
 */

import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch } from "react";

import { appEvents } from "../events/appEvents";
import { releaseEditorStatesExcept } from "../tabs/editorStateCache";
import { createEditorTab, type DesktopTab, type DesktopTabAction, type DesktopTabState } from "../tabs/tabModel";
import { workspaceDocumentApi } from "../workspace/workspaceDocumentAdapter";
import { loadWorkspaceDocument, saveWorkspaceDocument } from "../workspace/workspaceDocumentModel";
import {
  anchorDiskContents,
  applyRefusedSave,
  applyReloadedDocument,
  applySavedDocument,
  clearConflict,
  markConflict,
  moveDocumentView,
  NOTE_CONFLICT_ERROR_CODE,
  pruneConflicts,
  saveablePrecondition
} from "./externalDocumentSync";
import type { DocumentViewState } from "./shellTypes";

/** Props for {@link useDocumentViews}. */
export interface DocumentViewsProps {
  readonly tabState: DesktopTabState;
  readonly dispatchTabs: Dispatch<DesktopTabAction>;
}

/** The open documents and what can be done to them. */
export interface DocumentViews {
  /** View state per tab id. */
  readonly documents: Record<string, DocumentViewState>;
  /** Tabs whose file changed on disk while they held unsaved edits. */
  readonly conflicts: ReadonlySet<string>;
  /** Loads a document into a tab that already exists (or is about to). */
  readonly loadDocumentIntoView: (tabId: string, rootPath: string, relativePath: string) => void;
  /** Opens a note: makes the tab, announces it, loads it. */
  readonly openMarkdownDocument: (rootPath: string, relativePath: string) => void;
  /** Re-reads a changed file into the tab already showing it. */
  readonly reloadDocumentInPlace: (tabId: string, rootPath: string, relativePath: string) => void;
  /** Records an edit and marks the tab dirty. */
  readonly updateDocument: (tabId: string, contents: string) => void;
  /** Writes a tab to disk. Resolves `true` when the write succeeded. */
  readonly saveDocument: (tab: DesktopTab) => Promise<boolean>;
  /** Keeps the tab's edits and re-anchors it to what is now on disk. */
  readonly keepMyVersion: (tab: DesktopTab) => void;
  /** Discards the tab's edits and shows the file. */
  readonly loadDiskVersion: (tab: DesktopTab) => void;
  /** Follows a renamed file's view to its new tab id. */
  readonly moveDocument: (fromTabId: string, toTabId: string) => void;
  /** Flags a tab as holding edits the file no longer agrees with. */
  readonly markDocumentConflict: (tabId: string) => void;
  /** Stops asking about a note that went empty outside the app. */
  readonly dismissEmptied: (tabId: string) => void;
}

export function useDocumentViews({ tabState, dispatchTabs }: DocumentViewsProps): DocumentViews {
  const [documents, setDocuments] = useState<Record<string, DocumentViewState>>({});
  // Read by callbacks that must see the latest documents without being rebuilt
  // — and by `saveDocument`, which compares before and after an await.
  const documentsRef = useRef(documents);
  const [conflicts, setConflicts] = useState<ReadonlySet<string>>(new Set());

  useEffect(() => {
    documentsRef.current = documents;
  }, [documents]);

  // Everything a closed tab leaves behind, dropped together.
  //
  // The tab reducer only removes the tab; the view state, the conflict flag and
  // the parked editor state are owned elsewhere and would otherwise accumulate
  // — full note contents included — for as long as the window stays open.
  // Adjusting state during render behind a guard is React's own pattern for
  // derived state, which is why two of these are not effects.
  const openTabIds = useMemo(
    () => new Set(tabState.tabs.map((tab) => tab.id)),
    [tabState.tabs]
  );

  const hasOrphanedDocs = Object.keys(documents).some((id) => !openTabIds.has(id));
  if (hasOrphanedDocs) {
    const next: Record<string, DocumentViewState> = {};
    for (const [id, view] of Object.entries(documents)) {
      if (openTabIds.has(id)) next[id] = view;
    }
    setDocuments(next);
  }

  // A closed tab cannot answer a conflict, and the flag would come back to life
  // if the same file were reopened — a tab's id is built from its path.
  const prunedConflicts = pruneConflicts(conflicts, openTabIds);
  if (prunedConflicts !== conflicts) setConflicts(prunedConflicts);

  // An unmount cannot tell a switch away from a close, so the editor parks its
  // cursor and undo history either way and the shell — which knows which tabs
  // are left — drops the ones nobody can return to.
  useEffect(() => {
    releaseEditorStatesExcept(openTabIds);
  }, [openTabIds]);

  /**
   * Loads a workspace document into the view-state map.
   *
   * Shared by `openMarkdownDocument` (live opens) and the tab-restore effect
   * (restart). The caller dispatches the tab and, for live opens, announces it.
   */
  const loadDocumentIntoView = useCallback(
    (tabId: string, rootPath: string, relativePath: string) => {
      setDocuments((current) => ({
        ...current,
        [tabId]: { phase: "loading", contents: "", diskContents: null, error: null }
      }));
      void loadWorkspaceDocument(workspaceDocumentApi, { rootPath, relativePath }).then((result) => {
        setDocuments((current) => ({
          ...current,
          [tabId]: result.ok
            ? {
                phase: "ready",
                contents: result.document.contents,
                diskContents: result.document.contents,
                error: null
              }
            : {
                phase: "error",
                contents: "",
                diskContents: null,
                error: result.message,
                errorCode: result.code
              }
        }));
      });
    },
    []
  );

  const openMarkdownDocument = useCallback(
    (rootPath: string, relativePath: string) => {
      const tab = createEditorTab({ rootPath, relativePath });
      dispatchTabs({ type: "open", tab });
      appEvents.emit("note.opened", { rootPath, relativePath });

      // Already open: raising the tab is the whole action, and re-reading would
      // throw away edits the user has not saved.
      if (documentsRef.current[tab.id]) return;
      loadDocumentIntoView(tab.id, rootPath, relativePath);
    },
    // dispatchTabs is a stable reducer dispatch, so it stays out of the deps.
    [loadDocumentIntoView]
  );

  /**
   * Re-reads a note that changed on disk into the tab already showing it.
   *
   * Unlike `loadDocumentIntoView` this never blanks the tab first: the tab has
   * readable text now, and flashing it empty to fetch text it probably still
   * has would be worse than the staleness being fixed. A failed read leaves the
   * tab as it is for the same reason.
   */
  const reloadDocumentInPlace = useCallback(
    (tabId: string, rootPath: string, relativePath: string) => {
      const expectedContents = documentsRef.current[tabId]?.contents ?? "";
      void loadWorkspaceDocument(workspaceDocumentApi, { rootPath, relativePath }).then((result) => {
        if (!result.ok) return;
        setDocuments((current) =>
          applyReloadedDocument(current, tabId, expectedContents, result.document.contents)
        );
      });
    },
    []
  );

  const updateDocument = useCallback(
    (tabId: string, contents: string) => {
      setDocuments((current) => {
        const document = current[tabId];
        return document ? { ...current, [tabId]: { ...document, contents, error: null } } : current;
      });
      dispatchTabs({ type: "setDirty", tabId, isDirty: true });
    },
    // dispatchTabs is a stable reducer dispatch, so it stays out of the deps.
    []
  );

  /**
   * Persists a tab's document to disk.
   *
   * The write carries the text the tab was last level with on disk, so a file
   * something else has rewritten refuses this save instead of losing it. That
   * covers the case the conflict banner cannot: the banner only appears if the
   * watcher saw the change and the tab was already dirty, whereas the
   * precondition is checked on every save whatever the tab knew.
   *
   * @returns `true` when the write succeeded.
   */
  const saveDocument = useCallback(async (tab: DesktopTab): Promise<boolean> => {
    const document = documentsRef.current[tab.id];
    const rootPath = tab.resource?.rootPath;
    const relativePath = tab.resource?.relativePath;
    if (!document || !rootPath || !relativePath) return false;
    const expected = saveablePrecondition(document);
    if (expected === null) return false;

    setDocuments((current) => ({
      ...current,
      [tab.id]: { ...document, phase: "saving", error: null }
    }));
    const result = await saveWorkspaceDocument(workspaceDocumentApi, {
      rootPath,
      relativePath,
      contents: document.contents,
      expected
    });
    if (!result.ok) {
      // A refusal is not a failure to report. The tab keeps the user's text and
      // its dirty flag, and the banner puts the choice to them instead.
      if (result.code === NOTE_CONFLICT_ERROR_CODE) {
        setDocuments((current) => applyRefusedSave(current, tab.id));
        setConflicts((current) => markConflict(current, tab.id));
        return false;
      }
      setDocuments((current) => ({
        ...current,
        [tab.id]: { ...(current[tab.id] ?? document), phase: "error", error: result.message }
      }));
      return false;
    }

    const hasNewerEdits = documentsRef.current[tab.id]?.contents !== document.contents;
    setDocuments((current) => applySavedDocument(current, tab.id, document.contents));
    if (!hasNewerEdits) dispatchTabs({ type: "setDirty", tabId: tab.id, isDirty: false });
    // Saving settles any conflict this tab was holding: the user answered it by
    // writing their version, and the file is now theirs.
    setConflicts((current) => clearConflict(current, tab.id));
    return true;
    // dispatchTabs is a stable reducer dispatch, so it stays out of the deps.
  }, []);

  /**
   * Keeps the tab's unsaved edits and stops asking about the change on disk.
   *
   * Dismissing the banner is only half of it. The tab still computes its saves
   * from the version the user just declined, so without re-reading the file the
   * next save would be refused and this same notice would come back — with no
   * way through it. Re-anchoring is not the same as forcing the write: a
   * further change landing after this point is still caught.
   *
   * A failed read leaves the tab anchored where it was, so the save that
   * follows is refused rather than blind. Being asked twice is the safe way to
   * be wrong here.
   */
  const keepMyVersion = useCallback((tab: DesktopTab) => {
    setConflicts((current) => clearConflict(current, tab.id));
    const rootPath = tab.resource?.rootPath;
    const relativePath = tab.resource?.relativePath;
    if (!rootPath || !relativePath) return;
    void loadWorkspaceDocument(workspaceDocumentApi, { rootPath, relativePath }).then((result) => {
      if (!result.ok) return;
      setDocuments((current) => anchorDiskContents(current, tab.id, result.document.contents));
    });
  }, []);

  /**
   * Throws away the tab's unsaved edits and shows what is on disk.
   *
   * Uses the ordinary load rather than the in-place re-read: this is a
   * deliberate discard, so the brief loading state is honest, and the in-place
   * path would refuse anyway — its whole job is to not overwrite edits.
   */
  const loadDiskVersion = useCallback(
    (tab: DesktopTab) => {
      const rootPath = tab.resource?.rootPath;
      const relativePath = tab.resource?.relativePath;
      if (!rootPath || !relativePath) return;
      setConflicts((current) => clearConflict(current, tab.id));
      dispatchTabs({ type: "setDirty", tabId: tab.id, isDirty: false });
      loadDocumentIntoView(tab.id, rootPath, relativePath);
    },
    // dispatchTabs is a stable reducer dispatch, so it stays out of the deps.
    [loadDocumentIntoView]
  );

  /** Stops asking about a note that went empty outside the app. Writes nothing. */
  const dismissEmptied = useCallback((tabId: string) => {
    setDocuments((current) => {
      const document = current[tabId];
      if (!document?.emptiedOutside) return current;
      return { ...current, [tabId]: { ...document, emptiedOutside: false } };
    });
  }, []);

  // The two narrow doors the outside-change watcher needs. Exposed as actions
  // rather than the setters themselves so nothing else can reshape this state.
  const moveDocument = useCallback((fromTabId: string, toTabId: string) => {
    setDocuments((current) => moveDocumentView(current, fromTabId, toTabId));
  }, []);

  const markDocumentConflict = useCallback((tabId: string) => {
    setConflicts((current) => markConflict(current, tabId));
  }, []);

  return {
    documents,
    conflicts,
    loadDocumentIntoView,
    openMarkdownDocument,
    reloadDocumentInPlace,
    updateDocument,
    saveDocument,
    keepMyVersion,
    loadDiskVersion,
    moveDocument,
    markDocumentConflict,
    dismissEmptied
  };
}
