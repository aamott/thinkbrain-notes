import type { MarkdownLinkTarget } from "@thinkbrain/core";
import { useCallback, useMemo } from "react";

import type { DesktopCommand } from "../../commands/commandRegistry";
import { openUrl } from "../../native/opener";
import { documentTabId, editorTabId, type DesktopTab } from "../../tabs/tabModel";
import type { WorkspaceExplorerProps } from "../../workspace/WorkspaceExplorer";
import type { ShellState } from "../useShellState";
import type { PhoneNavigation } from "./usePhoneNavigation";

/** The shell values {@link usePhoneOpeners} reads, taken as values (never the
 *  `shell` object itself — useShellState returns a new object every render). */
export interface UsePhoneOpenersParams {
  readonly activeTab: DesktopTab | null;
  readonly saveDocument: ShellState["saveDocument"];
  readonly openMarkdownDocument: ShellState["openMarkdownDocument"];
  readonly openFileDocument: ShellState["openFileDocument"];
  readonly openNewTabDocument: ShellState["openNewTab"];
  readonly restoredWorkspacePath: string | null;
  readonly paletteCommands: readonly DesktopCommand[];
  readonly runPaletteCommand: ShellState["runCommand"];
  readonly navigation: PhoneNavigation;
  readonly explorerProps: WorkspaceExplorerProps;
}

/** The open callbacks and the explorer prop bag the phone chrome publishes. */
export interface PhoneOpeners {
  readonly openNewTab: () => void;
  readonly openNote: (relativePath: string) => void;
  /** Follows a resolved `[[wiki]]` or `[text](target)` link from the editor. */
  readonly onOpenLink: (target: MarkdownLinkTarget) => void;
  readonly createNewNote: () => void;
  readonly explorerProps: WorkspaceExplorerProps;
}

/**
 * The phone chrome's file/note open callbacks.
 *
 * Every open here pushes an explicit history entry — unlike opens that bypass
 * the chrome (see {@link usePhoneRouteSync}'s observer), these land the note
 * they open as one Back entry, not two.
 */
export function usePhoneOpeners({
  activeTab,
  saveDocument,
  openMarkdownDocument,
  openFileDocument,
  openNewTabDocument,
  restoredWorkspacePath,
  paletteCommands,
  runPaletteCommand,
  navigation,
  explorerProps
}: UsePhoneOpenersParams): PhoneOpeners {
  // The phone rule is one tab: a file tap fills the tab on screen. When that
  // tab is dirty it is saved first — autosave fires on a 1.5s idle, and a tap
  // inside that window would otherwise replace unsaved text. A failed save
  // leaves the tab dirty, which is exactly when the reducer appends rather
  // than displacing the edits.
  const flushThen = useCallback(
    (open: () => void) => {
      if (activeTab?.isDirty) void saveDocument(activeTab).finally(open);
      else open();
    },
    [activeTab, saveDocument]
  );

  // Opens that *do* pass through the phone chrome push explicitly, so the note
  // they land on is one history entry — not two. The observer above skips the
  // resulting active-tab change because the route already names the same tab.
  const openMarkdown = useCallback(
    (rootPath: string, relativePath: string) => {
      flushThen(() => {
        openMarkdownDocument(rootPath, relativePath, "replace-active");
        navigation.push({ kind: "tab", tabId: editorTabId({ rootPath, relativePath }) });
      });
    },
    [openMarkdownDocument, navigation, flushThen]
  );
  // The pushed route must name the tab `openFileDocument` actually creates —
  // `documentTabId` — so a `.md` tap lands on its `editor:` id, not a `file:`
  // route that misses the tab that was just made.
  const openFile = useCallback(
    (rootPath: string, relativePath: string) => {
      flushThen(() => {
        openFileDocument(rootPath, relativePath, "replace-active");
        navigation.push({ kind: "tab", tabId: documentTabId({ rootPath, relativePath }) });
      });
    },
    [openFileDocument, navigation, flushThen]
  );
  const openNewTab = useCallback(() => {
    // Same push pattern as the switcher's onSelect: creating the tab IS the
    // navigation, so the ephemeral switcher overlay closes with it.
    navigation.push({ kind: "tab", tabId: openNewTabDocument() });
  }, [navigation, openNewTabDocument]);
  const openNote = useCallback(
    (relativePath: string) => {
      if (restoredWorkspacePath) openMarkdown(restoredWorkspacePath, relativePath);
    },
    [restoredWorkspacePath, openMarkdown]
  );

  // A resolved link either leaves the vault — the OS opens it — or lands on a
  // vault-relative path `openFile` already routes to the right tab kind.
  const onOpenLink = useCallback(
    (target: MarkdownLinkTarget) => {
      if (target.kind === "external") {
        void openUrl(target.url).catch(() => undefined);
        return;
      }
      if (restoredWorkspacePath) openFile(restoredWorkspacePath, target.relativePath);
    },
    [restoredWorkspacePath, openFile]
  );

  // "Previous versions…" opens the file's inspector over the just-opened tab.
  // The desktop's shell callback only sets `rightPanel`, which phone chrome
  // does not read — inspectors exist here as navigation overlays. `push`
  // updates the entry ref synchronously, so `showOverlay` lands the inspector
  // on top of the new tab route rather than underneath it.
  const showVersions = useCallback(
    (rootPath: string, relativePath: string) => {
      openFile(rootPath, relativePath);
      navigation.showOverlay({ kind: "inspector", panel: "history", parent: "content" });
    },
    [openFile, navigation]
  );

  // The popup's create path runs the canonical command — the existing
  // Explorer focus/create flow — after landing on Files, so the inline file
  // name field is where the user is already looking. The popup is ephemeral:
  // pushing Files keeps Back honest (already on Files, the push just closes
  // the popup).
  const createNewNote = useCallback(() => {
    navigation.push({ kind: "files" });
    const command = paletteCommands.find((candidate) => candidate.id === "new-note");
    if (command) runPaletteCommand(command);
  }, [navigation, paletteCommands, runPaletteCommand]);

  // Same bag the desktop dock gets, minus the two open callbacks and
  // `onShowVersions`: file taps and "Previous versions…" must route through
  // the history stack instead of only activating a tab.
  const mergedExplorerProps = useMemo(
    () => ({
      ...explorerProps,
      onMarkdownFileSelected: openMarkdown,
      onFileSelected: openFile,
      onShowVersions: showVersions
    }),
    [explorerProps, openMarkdown, openFile, showVersions]
  );

  return {
    openNewTab,
    openNote,
    onOpenLink,
    createNewNote,
    explorerProps: mergedExplorerProps
  };
}
