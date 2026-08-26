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

import { subscribeToNoteChanges } from "../events/noteChangeSubscription";
import { editorTabId, type DesktopTabAction, type DesktopTabState } from "../tabs/tabModel";
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

    return subscribeToNoteChanges(
      () => rootPath,
      (change) => {
        // A tab is identified by the path of its file, so a rename moves the
        // tab rather than changing what it holds. This is not only about
        // outside renames: renaming from the explorer left the tab pointing at
        // a path nothing lived at, and saving it recreated the old file.
        if (change.kind === "renamed") {
          const from = { rootPath, relativePath: change.oldRelativePath };
          const to = { rootPath, relativePath: change.newRelativePath };
          const fromTabId = editorTabId(from);
          if (!tabStateRef.current.tabs.some((tab) => tab.id === fromTabId)) return;
          moveDocument(fromTabId, editorTabId(to));
          dispatchTabs({ type: "retarget", from, to });
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
  }, [workspacePath, tabStateRef, dispatchTabs, moveDocument, markDocumentConflict, reloadDocumentInPlace]);
}
