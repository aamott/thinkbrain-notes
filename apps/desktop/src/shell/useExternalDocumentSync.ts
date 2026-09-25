/**
 * Keeping open editor tabs level with the files they are showing.
 *
 * The subscription half of `externalDocumentSync.ts`. That module decides what
 * a change means and stays pure; this one listens, and hands each decision to
 * the document actions that can carry it out.
 *
 * Separate from `useDocumentViews` because of what it needs: the workspace
 * root, which is only known after the workspace lifecycle has restored it,
 * while the documents have to exist before that — the lifecycle hook loads
 * restored tabs through them. Splitting the listener off is what lets each be
 * mounted at the point its inputs are ready.
 */

import { useEffect, type Dispatch, type RefObject } from "react";

import { appEvents } from "../events/appEvents";
import { subscribeToNoteChanges } from "../events/noteChangeSubscription";
import { documentTabId, editorTabId, fileTabId, type DesktopTabAction, type DesktopTabState } from "../tabs/tabModel";
import { planDocumentSync, type OpenDocument } from "./externalDocumentSync";

/** Props for {@link useExternalDocumentSync}. */
export interface ExternalDocumentSyncProps {
  /** Workspace root, or null before one is open. */
  readonly workspacePath: string | null;
  /**
   * The current tabs, by ref.
   *
   * The subscription outlives any one set of tabs and must not be rebuilt every
   * time one opens or closes — resubscribing on each would drop changes in the
   * gap.
   */
  readonly tabStateRef: RefObject<DesktopTabState>;
  readonly dispatchTabs: Dispatch<DesktopTabAction>;
  /** Follows a renamed file's view to its new tab id. */
  readonly moveDocument: (fromTabId: string, toTabId: string) => void;
  /** Flags a tab whose edits the file no longer agrees with. */
  readonly markDocumentConflict: (tabId: string) => void;
  /** Re-reads a changed file into the tab showing it. */
  readonly reloadDocumentInPlace: (tabId: string, rootPath: string, relativePath: string) => void;
}

/**
 * Subscribes to outside note changes and applies each one.
 *
 * A tab is a copy of a file taken when it opened, and nothing used to tell the
 * shell that copy had gone stale — a note edited in another program stayed on
 * screen as it was, and saving from that tab put the old text back over the
 * newer file.
 */
export function useExternalDocumentSync({
  workspacePath,
  tabStateRef,
  dispatchTabs,
  moveDocument,
  markDocumentConflict,
  reloadDocumentInPlace
}: ExternalDocumentSyncProps): void {
  useEffect(() => {
    if (!workspacePath) return;
    const rootPath = workspacePath;

    // A tab is identified by the path of its file, so a rename moves the tab
    // rather than changing what it holds. Markdown files keep `editor:` tabs
    // and everything else keeps `file:` tabs, so either id may be the match.
    // This is not only about outside renames: renaming from the explorer left
    // the tab pointing at a path nothing lived at, and saving it recreated
    // the old file.
    const retargetOpenTab = (oldRelativePath: string, newRelativePath: string) => {
      const from = { rootPath, relativePath: oldRelativePath };
      const to = { rootPath, relativePath: newRelativePath };
      const open = tabStateRef.current.tabs.find(
        (tab) => tab.id === editorTabId(from) || tab.id === fileTabId(from)
      );
      if (!open) return;
      // The destination's own inferred kind decides the new id — an
      // extension-changing rename moves the document to the other id scheme.
      moveDocument(open.id, documentTabId(to));
      dispatchTabs({ type: "retarget", from, to });
    };

    // `file.renamed` carries non-Markdown moves; it runs the same retarget but
    // stays off `subscribeToNoteChanges` so note indexes never observe it.
    const fileRenamed = appEvents.on("file.renamed", (event) => {
      if (event.rootPath !== rootPath) return;
      retargetOpenTab(event.oldRelativePath, event.newRelativePath);
    });

    const unsubscribeNotes = subscribeToNoteChanges(
      () => rootPath,
      (change) => {
        if (change.kind === "renamed") {
          retargetOpenTab(change.oldRelativePath, change.newRelativePath);
          return;
        }

        const openDocuments: readonly OpenDocument[] = tabStateRef.current.tabs.flatMap((tab) => {
          const resource = tab.resource;
          if (tab.kind !== "editor" || !resource?.rootPath || !resource.relativePath) return [];
          return [
            {
              tabId: tab.id,
              rootPath: resource.rootPath,
              relativePath: resource.relativePath,
              isDirty: Boolean(tab.isDirty)
            }
          ];
        });

        for (const action of planDocumentSync(openDocuments, change)) {
          if (action.kind === "conflict") {
            markDocumentConflict(action.tabId);
            continue;
          }
          reloadDocumentInPlace(action.tabId, action.rootPath, action.relativePath);
        }
      }
    );

    return () => {
      unsubscribeNotes();
      void fileRenamed.dispose();
    };
  }, [workspacePath, tabStateRef, dispatchTabs, moveDocument, markDocumentConflict, reloadDocumentInPlace]);
}
