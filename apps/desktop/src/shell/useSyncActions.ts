/**
 * Conflict review and version-history actions — what the sync surfaces on
 * both docks dispatch into the shell. Split out of {@link useShellState}.
 */

import { useCallback, type Dispatch, type RefObject, type SetStateAction } from "react";
import { sectionAnchorId } from "../settings/sectionUtils";
import { useSettingsStore } from "../settings/settingsStore";
import { restoreVersion } from "../sync/syncService";
import {
  createConflictTab,
  createVersionDiffTab,
  isFileResourceTab,
  type DesktopTab,
  type DesktopTabAction,
  type DesktopTabState
} from "../tabs/tabModel";
import type { LeftPanel, RightPanel } from "./shellTypes";

interface UseSyncActionsOptions {
  readonly restoredWorkspacePath: string | null;
  readonly dispatchTabs: Dispatch<DesktopTabAction>;
  /**
   * Live tabs for `restoreVersionSafely`'s dirty-check — a ref because the
   * subscription pattern that reads it outlives any one set of tabs.
   */
  readonly tabStateRef: RefObject<DesktopTabState>;
  readonly setRightPanel: Dispatch<SetStateAction<RightPanel | null>>;
  readonly selectLeftPanel: (panel: LeftPanel) => void;
  /**
   * Opens a file in the tab kind its extension implies — `openFileDocument`
   * already routes `.md` to the Markdown editor and media to a viewer.
   */
  readonly openFileDocument: (rootPath: string, relativePath: string) => void;
  readonly saveDocument: (tab: DesktopTab) => Promise<boolean>;
  readonly loadDocumentIntoView: (tabId: string, rootPath: string, relativePath: string, kind?: string) => void;
  readonly openSettingsTab: () => void;
}

export function useSyncActions({
  restoredWorkspacePath,
  dispatchTabs,
  tabStateRef,
  setRightPanel,
  selectLeftPanel,
  openFileDocument,
  saveDocument,
  loadDocumentIntoView,
  openSettingsTab
}: UseSyncActionsOptions) {
  // Opens the side-by-side comparison for a conflict. Named by the copy the
  // sync daemon left behind, which is what identifies a conflict everywhere
  // else; the note's own path rides along so the tab can be titled after it and
  // can find an editor open on it.
  const reviewConflict = useCallback(
    (copyPath: string, notePath: string) => {
      if (!restoredWorkspacePath) return;
      dispatchTabs({
        type: "open",
        tab: createConflictTab({ rootPath: restoredWorkspacePath, relativePath: copyPath }, notePath)
      });
    },
    [restoredWorkspacePath, dispatchTabs]
  );

  /**
   * "Previous versions…" opens the file itself — Markdown in an editor, other
   * files by their inferred kind so media lands in a viewer — then reveals
   * its Version history on the right.
   */
  const showVersionsOf = useCallback(
    (rootPath: string, relativePath: string) => {
      openFileDocument(rootPath, relativePath);
      setRightPanel("history");
    },
    [openFileDocument, setRightPanel]
  );

  // Conflicts are an attention list — they belong on the left with the other
  // navigational surfaces. History inspects the active file, so it joins the
  // document inspector on the right.
  const openSyncPanel = useCallback(
    (panel: "conflicts" | "history") => {
      if (panel === "history") {
        setRightPanel("history");
      } else {
        selectLeftPanel("conflicts");
      }
    },
    [selectLeftPanel, setRightPanel]
  );

  /**
   * Opens a read-only comparison of a file with one of its recorded versions.
   * The tab carries the workspace root so it survives the file being renamed
   * after the version was recorded.
   */
  const compareVersion = useCallback(
    (notePath: string, changeId: string, versionAt?: number | null) => {
      if (!restoredWorkspacePath) return;
      // The comparison replaces the inspector that launched it — leaving
      // Version history open under the new tab only crowds a narrow window.
      setRightPanel(null);
      dispatchTabs({
        type: "open",
        tab: createVersionDiffTab(
          { rootPath: restoredWorkspacePath, relativePath: notePath },
          changeId,
          versionAt ?? null
        )
      });
    },
    [restoredWorkspacePath, setRightPanel, dispatchTabs]
  );

  const restoreVersionSafely = useCallback(
    async (notePath: string, changeId: string) => {
      if (!restoredWorkspacePath) {
        throw new Error("Open a workspace before restoring an earlier version.");
      }
      // Every dirty view of this file is holding edits the restore would
      // overwrite — a resource may be open in several trails under different
      // view ids, so match by resource, never the canonical id. Save them
      // all; any save that cannot happen — refused because something else
      // wrote the file, or failed outright — stops the restore and the
      // edits stay put.
      const viewsOfFile = () =>
        tabStateRef.current.tabs.filter(
          (tab) =>
            isFileResourceTab(tab) &&
            tab.resource?.rootPath === restoredWorkspacePath &&
            tab.resource.relativePath === notePath
        );
      for (const tab of viewsOfFile()) {
        if (tab.isDirty && !(await saveDocument(tab))) {
          throw new Error("Save the current file before restoring an earlier version.");
        }
      }
      await restoreVersion(restoredWorkspacePath, notePath, changeId);
      // Re-read what the restore wrote into every open view of the file.
      // A fresh load rather than the in-place path: the restore already
      // saved any dirty edits above, and the loader must match the tab's
      // kind — `loadDocumentIntoView` picks the text-file reader for code
      // editors, where `reloadDocumentInPlace` would ask the Markdown
      // reader for a `.ts` file. Media viewers hold no document state.
      for (const tab of viewsOfFile()) {
        if (tab.kind === "editor" || tab.kind === "code-editor") {
          loadDocumentIntoView(tab.id, restoredWorkspacePath, notePath, tab.kind);
        }
      }
    },
    [restoredWorkspacePath, tabStateRef, saveDocument, loadDocumentIntoView]
  );

  /**
   * Conflict settings live under the workspace sync section, so "Sync
   * settings" opens the settings tab already scrolled to it.
   */
  const openSyncSettings = useCallback(() => {
    const sectionId = "workspace:sync.destination";
    useSettingsStore.getState().setActiveSection(sectionId);
    openSettingsTab();
    // The settings tab may still be mounting when this dispatch lands, so the
    // scroll happens on the next frames rather than assuming the section is
    // already in the document. The anchor id goes through `sectionAnchorId` —
    // the `settings-section-` prefix is `sectionUtils`' contract, not a string
    // to rebuild here.
    const scrollToSection = (finalAttempt: boolean) => {
      const anchor = document.getElementById(sectionAnchorId(sectionId));
      if (anchor) {
        anchor.scrollIntoView({ behavior: "smooth", block: "start" });
        return;
      }
      // A miss is only worth reporting once the section list has rendered:
      // mounted sections without this anchor means the section id drifted
      // from the DOM contract — say so instead of optional-chaining a scroll
      // to nowhere. Before the list mounts (or in a test that never renders
      // it) a miss tells us nothing, so it stays quiet.
      const sectionsMounted = document.querySelector(
        `section[id^="${sectionAnchorId("")}"]`
      );
      if (finalAttempt && sectionsMounted) {
        console.error(
          `[useSyncActions] Settings section "${sectionId}" produced no rendered anchor.`
        );
      }
    };
    requestAnimationFrame(() => {
      scrollToSection(false);
      requestAnimationFrame(() => scrollToSection(true));
    });
  }, [openSettingsTab]);

  return {
    compareVersion,
    openSyncPanel,
    openSyncSettings,
    restoreVersionSafely,
    reviewConflict,
    showVersionsOf
  };
}
