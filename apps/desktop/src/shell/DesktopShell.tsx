/**
 * The desktop presentation: activity rail, side docks, tab strip, status bar.
 *
 * Chrome only. Every decision this file used to make now lives in
 * {@link useShellState}, which a phone chrome consumes just as readily. What
 * remains here is layout — the grid, the docks, the resize handles — plus the
 * one effect that publishes dock widths onto this component's own root element.
 */

import { useEffect, useMemo, useRef } from "react";
import { FilePlus2, Folder, FolderCog, FolderOpen, FolderPlus, Link, Search } from "lucide-react";
import { CommandPalette, type WorkspaceFileResult } from "../commands/CommandPalette";
import { BottomPanel as BottomPanelContent } from "../panels/BottomPanel";
import { LeftPopout } from "../panels/LeftPopout";
import { RightPopout } from "../panels/RightPopout";
import { desktopPanelRegistry, type DesktopPanelContext } from "../panels/panelRegistryModel";
import { ActivityBar } from "./ActivityBar";
import { ResizeHandle } from "./ResizeHandle";
import { EmptiedNoteBanner } from "./EmptiedNoteBanner";
import { StaleDocumentBanner } from "./StaleDocumentBanner";
import { UpdateBanner } from "./UpdateBanner";
import { useNoteTitle } from "./useNoteTitle";
import { NoteTitleRow } from "./phone/NoteTitleRow";
import { useSettingsStore } from "../settings/settingsStore";
import { StatusBar } from "./StatusBar";
import { type NewTabAction } from "../tabs/NewTabView";
import { TabBoundary } from "./TabBoundary";
import { TabCloseRequest } from "./TabCloseRequest";
import { TabContent } from "./TabContent";
import { canGoBackInTabs, canGoForwardInTabs, inspectableRelativePath } from "../tabs/tabModel";
import { TitleBar } from "./TitleBar";
import { WorkspaceHeaderBar } from "./WorkspaceHeaderBar";
import { CREATE_MANAGED_WORKSPACE_LABEL, IMPORT_FROM_GIT_LABEL, MANAGE_WORKSPACES_LABEL, OPEN_FOLDER_LABEL } from "../workspace/gitLinkImportCopy";
import { useWorkspaceSwitching } from "../workspace/useWorkspaceSwitching";
import { WorkspaceSwitchingContext } from "../workspace/workspaceSwitchingContext";
import { WorkspaceSwitchingDialogs } from "../workspace/WorkspaceSwitching";
import { workspaceDesktopApi } from "../workspace/workspaceAdapter";
import type { ShellState } from "./useShellState";

export function DesktopShell({ shell }: { readonly shell: ShellState }) {
  const rootRef = useRef<HTMLElement>(null);
  const { activeTab, activeDocument, tabState, dispatchTabs } = shell;
  const { leftPanel, leftWidth, rightPanel, rightWidth } = shell;
  const resource = activeTab?.resource;
  const rootPath = resource?.rootPath;
  const relativePath = resource?.relativePath;
  // The inspector's file: the tab's resource unless it is a comparison tab —
  // see `inspectableRelativePath`.
  const documentPath = inspectableRelativePath(activeTab);

  // Journal entries render their own dateline, so the title row hides there —
  // same rule as PhoneShell. Only ordinary Markdown editor tabs get a title.
  const showNoteTitle = useNoteTitle(activeTab);
  const workspaceSelectorPlacement = useSettingsStore((s) =>
    s.getEffectiveValue("ui.workspaceSelectorPlacement") === "panel headers"
      ? "panel headers"
      : "title bar"
  );

  const selectorInPanel = workspaceSelectorPlacement === "panel headers";
  // The explorer renders its own chrome row; the flag tells it whether the
  // selector trigger lives in that row or elsewhere (title bar / drawer).
  // Memoized because WorkspaceExplorer itself is memoized.
  const explorerProps = useMemo(
    () => ({ ...shell.explorerProps, workspaceSelectorInPanel: selectorInPanel }),
    [shell.explorerProps, selectorInPanel]
  );
  // One context object for both docks: the same values the popouts render
  // with are the values the right-panel availability gate reads, so the two
  // can never disagree about what "the active document" is.
  const panelContext: DesktopPanelContext = {
    rootPath: shell.restoredWorkspacePath,
    explorerProps,
    onOpenSearchResult: shell.onOpenNote,
    onReviewConflict: shell.reviewConflict,
    onOpenSyncSettings: shell.openSyncSettings,
    documentContents: activeDocument?.phase === "ready" ? activeDocument.contents : null,
    documentPath,
    onOpenNote: shell.onOpenNote,
    onCompareVersion: shell.compareVersion,
    onRestoreVersion: shell.restoreVersionSafely
  };
  // A panel that is selected but unavailable for the active document stays
  // selected (it comes back when a file is active again) — but nothing may
  // claim it: no reserved width, no highlighted action, no dock.
  const effectiveRightPanel =
    rightPanel && desktopPanelRegistry.isAvailable(rightPanel, panelContext)
      ? rightPanel
      : null;

  // One availability answer for every place a panel is offered — the title
  // bar's icons and ⋯ menu, the rail's left icons — evaluated against the
  // same context the popouts render with, so no surface can offer a panel
  // whose selection would silently render nothing. The predicate lives here
  // rather than in the chrome because the context does.
  const isPanelAvailable = (panelId: string): boolean =>
    desktopPanelRegistry.isAvailable(panelId, panelContext);

  // The new-tab page's entry points, wired to the desktop's own surfaces:
  // commands run through the palette's context, files through the palette's
  // quick-open. The phone chrome supplies the same three routed its own way.
  const { paletteCommands, runCommand, openPalette, workspaceName } = shell;
  // With no workspace open, the landing tab's job is direction — the same
  // create/open entry points the explorer's empty state offers, run through
  // the shell-level switching controller whose dialogs live here too.
  const switching = useWorkspaceSwitching({
    api: workspaceDesktopApi,
    openWorkspaceInWindow: shell.openWorkspaceInWindow,
    onWorkspaceLaunched: shell.explorerProps.onWorkspaceLaunched
  });
  const newTab = useMemo(() => {
    if (workspaceName === null) {
      const actions: NewTabAction[] = [];
      if (switching.accessCapabilities?.canCreateManagedWorkspace) {
        actions.push({ id: "create-vault", label: CREATE_MANAGED_WORKSPACE_LABEL, icon: <FolderPlus aria-hidden="true" className="size-4" />, onSelect: () => switching.setCreateManagedWorkspaceOpen(true) });
      }
      if (switching.accessCapabilities?.canOpenFolder) {
        actions.push({ id: "open-folder", label: OPEN_FOLDER_LABEL, icon: <FolderOpen aria-hidden="true" className="size-4" />, onSelect: () => void switching.openWorkspace() });
      }
      actions.push({ id: "import-git", label: IMPORT_FROM_GIT_LABEL, icon: <Link aria-hidden="true" className="size-4" />, onSelect: switching.openGitLinkImport });
      for (const workspace of switching.knownWorkspaces) {
        if (workspace.missing) continue;
        actions.push({ id: `open:${workspace.rootPath}`, label: workspace.name, icon: <Folder aria-hidden="true" className="size-4" />, onSelect: () => void switching.launchWorkspace(workspace.rootPath) });
      }
      actions.push({ id: "manage-workspaces", label: MANAGE_WORKSPACES_LABEL, icon: <FolderCog aria-hidden="true" className="size-4" />, onSelect: switching.openManageWorkspaces });
      return { workspaceName, actions };
    }
    const runById = (id: string) => {
      const command = paletteCommands.find((candidate) => candidate.id === id);
      if (command) runCommand(command);
    };
    return {
      workspaceName,
      actions: [
        { id: "new-note", label: "New note", icon: <FilePlus2 aria-hidden="true" className="size-4" />, onSelect: () => runById("new-note") },
        { id: "open-file", label: "Open file", icon: <FolderOpen aria-hidden="true" className="size-4" />, onSelect: () => openPalette() },
        { id: "search", label: "Search workspace", icon: <Search aria-hidden="true" className="size-4" />, onSelect: () => runById("search") }
      ]
    };
  }, [paletteCommands, runCommand, openPalette, workspaceName, switching]);

  const leftPopout = (
    <LeftPopout
      panel={leftPanel ?? "explorer"}
      rootPath={panelContext.rootPath}
      explorerProps={panelContext.explorerProps}
      onReviewConflict={panelContext.onReviewConflict}
      onOpenSyncSettings={panelContext.onOpenSyncSettings}
      onOpenSearchResult={panelContext.onOpenSearchResult}
      workspaceSelectorInPanel={selectorInPanel}
    />
  );

  // Dock widths are published as CSS custom properties so the popouts can size
  // themselves from tokens instead of inline styles. The left dock publishes 0
  // when collapsed so the title bar releases the reserved space.
  useEffect(() => {
    rootRef.current?.style.setProperty("--tn-shell-left-width", leftPanel ? `${leftWidth}px` : "0px");
    rootRef.current?.style.setProperty("--tn-shell-right-width", effectiveRightPanel ? `${rightWidth}px` : "0px");
  }, [leftWidth, leftPanel, effectiveRightPanel, rightWidth]);

  return (
    <WorkspaceSwitchingContext.Provider value={switching}>
      <main
        className="grid grid-rows-[2.25rem_auto_minmax(0,1fr)_1.5rem] grid-cols-[minmax(0,1fr)] w-full max-w-full h-full min-w-0 overflow-hidden bg-background text-foreground"
        ref={rootRef}
        aria-label="ThinkBrain desktop workspace"
      >
        <TitleBar
          tabs={tabState.tabs}
          activeTabId={tabState.activeTabId}
          rightPanel={effectiveRightPanel}
          showWorkspaceSelector={workspaceSelectorPlacement === "title bar"}
          currentWorkspacePath={shell.restoredWorkspacePath ?? undefined}
          canGoBack={canGoBackInTabs(tabState)}
          canGoForward={canGoForwardInTabs(tabState)}
          onBack={() => dispatchTabs({ type: "goBack" })}
          onForward={() => dispatchTabs({ type: "goForward" })}
          onSelectTab={(tabId) => dispatchTabs({ type: "activate", tabId })}
          onRequestCloseTab={(tabId) => dispatchTabs({ type: "requestClose", tabId })}
          onKeepTab={(tabId) => dispatchTabs({ type: "keep", tabId })}
          onNewTab={() => shell.openNewTab()}
          onToggleRightPanel={shell.toggleRightPanel}
          onOpenCommandPalette={shell.openPalette}
          isPanelAvailable={isPanelAvailable}
        />

        {/* Its own grid row, which collapses to nothing while there is no update
            to offer. Above the workspace rather than inside a tab: this is about
            the app, not about the note anyone happens to be reading. */}
        <UpdateBanner state={shell.update.state} onInstall={shell.update.install} onDismiss={shell.update.dismiss} />

        {/* Positioning context for the overlaid docks: the right popout
            anchors here at ≤900px, the left at ≤760px. `min-w-0` keeps a wide
            tab's content from stretching the chrome off the window. */}
        <div className="flex min-h-0 min-w-0 max-w-full overflow-hidden max-[900px]:relative">
          <ActivityBar
            leftPanel={leftPanel}
            onSelectLeftPanel={shell.selectLeftPanel}
            onOpenSettings={shell.openSettingsTab}
            badges={shell.conflictBadges}
            isPanelAvailable={isPanelAvailable}
          />

          <div className={leftPanel ? "contents" : "hidden"} aria-hidden={leftPanel ? undefined : "true"}>
            {leftPopout}
          </div>
          {leftPanel && (
            <ResizeHandle
              label="Resize left panel"
              onPointerDown={shell.resize.beginResize("left")}
              onPointerCancel={shell.resize.cancelResize}
              onDoubleClick={() => shell.resetPanelWidth("left")}
              onKeyDown={shell.resize.resizeWithKeyboard("left")}
            />
          )}

          <section className="flex flex-col flex-auto min-w-0 max-w-full overflow-hidden" aria-label="Note workspace">
            {/* Children own their scrolling — the article only clips, so a
                tab wider than the window cannot push the shell off the edge. */}
            <article className="flex flex-1 flex-col min-h-0 min-w-0 max-w-full overflow-hidden bg-editor">
              {/* Settings tabs render their own SettingsHeaderBar inside SettingsTab,
                  so hide the shared WorkspaceHeaderBar to avoid stacking two header bars. */}
              {activeTab?.kind !== "settings" && (
                <WorkspaceHeaderBar
                  workspaceName={shell.workspaceName}
                  rootPath={shell.restoredWorkspacePath}
                  activeTab={activeTab}
                  isDirty={Boolean(activeTab?.isDirty)}
                  isSaving={activeDocument?.phase === "saving"}
                  onSave={() => {
                    if (activeTab) void shell.saveDocument(activeTab);
                  }}
                />
              )}
              {showNoteTitle && (
                <NoteTitleRow
                  key={relativePath}
                  relativePath={relativePath ?? null}
                  onRename={rootPath && relativePath
                    ? (newPath) => shell.renameDocument(rootPath, relativePath, newPath)
                    : undefined}
                />
              )}
              {activeTab && shell.conflicts.has(activeTab.id) && (
                <StaleDocumentBanner
                  fileName={activeTab.title}
                  onKeepMine={() => shell.keepMyVersion(activeTab)}
                  onLoadFromDisk={() => shell.loadDiskVersion(activeTab)}
                />
              )}
              {activeTab && activeDocument?.emptiedOutside && rootPath && relativePath && (
                <EmptiedNoteBanner
                  rootPath={rootPath}
                  relativePath={relativePath}
                  fileName={activeTab.title}
                  onDismiss={() => shell.dismissEmptied(activeTab.id)}
                  onRestored={() => shell.loadDocumentIntoView(activeTab.id, rootPath, relativePath)}
                />
              )}
              {/* One boundary per tab: a crash shows the failed tab's state,
                  not a white shell, and the next tab mounts a fresh boundary. */}
              <TabBoundary key={activeTab?.id ?? "no-tab"}>
                <TabContent tab={activeTab} document={activeDocument} onChange={shell.updateDocument} onSave={shell.saveDocument} noteIndex={shell.noteIndex} onOpenNote={shell.onOpenNote} onReopenNote={shell.loadDocumentIntoView} unsavedNoteContents={shell.unsavedNoteContents} onRestoreVersion={shell.restoreVersionSafely} newTab={newTab} />
              </TabBoundary>
            </article>
            {shell.bottomPanel && (
              <div className="shrink-0 tn-slide-in-bottom">
                <BottomPanelContent
                  active={shell.bottomPanel}
                  onChange={shell.updateBottomPanel}
                  onClose={() => shell.updateBottomPanel(null)}
                />
              </div>
            )}
          </section>

          {effectiveRightPanel && (
            <>
              {/* An overlaid panel is not dock-resizable, so the handle hides
                  at the same 900px breakpoint where the popout overlays. */}
              <ResizeHandle
                label="Resize right panel"
                className="max-[900px]:hidden"
                onPointerDown={shell.resize.beginResize("right")}
                onPointerCancel={shell.resize.cancelResize}
                onDoubleClick={() => shell.resetPanelWidth("right")}
                onKeyDown={shell.resize.resizeWithKeyboard("right")}
              />
              <RightPopout
                panel={effectiveRightPanel}
                context={panelContext}
                onBack={() => shell.setRightPanel(null)}
              />
            </>
          )}
        </div>

        <StatusBar
          workspaceName={shell.workspaceName}
          syncStatus={shell.syncStatus}
          onOpenSyncPanel={shell.openSyncPanel}
          onOpenSettings={shell.openSettingsTab}
        />

        {shell.paletteOpen && (
          <CommandPalette
            commands={shell.paletteCommands}
            files={shell.workspaceFiles
              .map((file): WorkspaceFileResult => ({ rootPath: shell.restoredWorkspacePath ?? "", relativePath: file.relative_path }))
              .filter((file) => Boolean(file.rootPath))}
            onClose={shell.closePalette}
            onCommand={shell.runCommand}
            onOpenFile={(file) => shell.openMarkdownDocument(file.rootPath, file.relativePath, "preview")}
          />
        )}
        <TabCloseRequest shell={shell} />
        {/* One dialog set for every switching surface — title bar, panel
            headers, landing-tab actions — mounted at shell level so it is
            never hidden by the panel that opened it. */}
        <WorkspaceSwitchingDialogs currentPath={shell.restoredWorkspacePath ?? undefined} />
      </main>
    </WorkspaceSwitchingContext.Provider>
  );
}
