/**
 * The desktop presentation: activity rail, side docks, tab strip, status bar.
 *
 * Chrome only. Every decision this file used to make now lives in
 * {@link useShellState}, which a phone chrome consumes just as readily. What
 * remains here is layout — the grid, the docks, the resize handles — plus the
 * one effect that publishes dock widths onto this component's own root element.
 */

import { useEffect, useRef } from "react";
import { CommandPalette, type WorkspaceFileResult } from "../commands/CommandPalette";
import { BottomPanel as BottomPanelContent } from "../panels/BottomPanel";
import { LeftPopout } from "../panels/LeftPopout";
import { RightPopout } from "../panels/RightPopout";
import { ActivityBar } from "./ActivityBar";
import { ResizeHandle } from "./ResizeHandle";
import { EmptiedNoteBanner } from "./EmptiedNoteBanner";
import { StaleDocumentBanner } from "./StaleDocumentBanner";
import { UpdateBanner } from "./UpdateBanner";
import { StatusBar } from "./StatusBar";
import { TabCloseRequest } from "./TabCloseRequest";
import { TabContent } from "./TabContent";
import { TitleBar } from "./TitleBar";
import { WorkspaceHeaderBar } from "./WorkspaceHeaderBar";
import type { ShellState } from "./useShellState";

export function DesktopShell({ shell }: { readonly shell: ShellState }) {
  const rootRef = useRef<HTMLElement>(null);
  const { activeTab, activeDocument, tabState, dispatchTabs } = shell;
  const { leftPanel, leftWidth, rightPanel, rightWidth } = shell;

  // Dock widths are published as CSS custom properties so the popouts can size
  // themselves from tokens instead of inline styles. The left dock publishes 0
  // when collapsed so the title bar releases the reserved space.
  useEffect(() => {
    rootRef.current?.style.setProperty("--tn-shell-left-width", leftPanel ? `${leftWidth}px` : "0px");
    rootRef.current?.style.setProperty("--tn-shell-right-width", `${rightWidth}px`);
  }, [leftWidth, leftPanel, rightWidth]);

  return (
    <main
      className="grid grid-rows-[2.25rem_auto_minmax(0,1fr)_1.5rem] h-full min-w-184 max-[760px]:min-w-0 overflow-hidden bg-background text-foreground"
      ref={rootRef}
      aria-label="ThinkBrain desktop workspace"
    >
      <TitleBar
        tabs={tabState.tabs}
        activeTabId={tabState.activeTabId}
        rightPanel={rightPanel}
        onSelectTab={(tabId) => dispatchTabs({ type: "activate", tabId })}
        onRequestCloseTab={(tabId) => dispatchTabs({ type: "requestClose", tabId })}
        onToggleRightPanel={shell.toggleRightPanel}
        onOpenCommandPalette={shell.openPalette}
      />

      {/* Its own grid row, which collapses to nothing while there is no update
          to offer. Above the workspace rather than inside a tab: this is about
          the app, not about the note anyone happens to be reading. */}
      <UpdateBanner state={shell.update.state} onInstall={shell.update.install} onDismiss={shell.update.dismiss} />

      <div className="flex min-h-0 max-[760px]:relative">
        <ActivityBar
          leftPanel={leftPanel}
          onSelectLeftPanel={shell.selectLeftPanel}
          onOpenSettings={shell.openSettingsTab}
          badges={shell.conflictBadges}
        />

        {leftPanel && (
          <>
            <LeftPopout
              panel={leftPanel}
              rootPath={shell.restoredWorkspacePath}
              explorerProps={shell.explorerProps}
              onReviewConflict={shell.reviewConflict}
              versionsOf={shell.versionsOf}
              onShowEverything={shell.clearVersions}
              onOpenSearchResult={(relativePath) => {
                if (shell.restoredWorkspacePath) shell.openMarkdownDocument(shell.restoredWorkspacePath, relativePath);
              }}
            />
            <ResizeHandle
              label="Resize left panel"
              onPointerDown={shell.resize.beginResize("left")}
              onPointerCancel={shell.resize.cancelResize}
              onDoubleClick={() => shell.resetPanelWidth("left")}
              onKeyDown={shell.resize.resizeWithKeyboard("left")}
            />
          </>
        )}

        <section className="flex flex-col flex-auto min-w-60" aria-label="Note workspace">
          <article className="flex flex-1 flex-col min-h-0 overflow-auto bg-editor">
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
            {activeTab && shell.conflicts.has(activeTab.id) && (
              <StaleDocumentBanner
                fileName={activeTab.title}
                onKeepMine={() => shell.keepMyVersion(activeTab)}
                onLoadFromDisk={() => shell.loadDiskVersion(activeTab)}
              />
            )}
            {activeTab && activeDocument?.emptiedOutside && activeTab.resource?.rootPath && activeTab.resource?.relativePath && (
              <EmptiedNoteBanner
                rootPath={activeTab.resource.rootPath}
                relativePath={activeTab.resource.relativePath}
                fileName={activeTab.title}
                onDismiss={() => shell.dismissEmptied(activeTab.id)}
                onRestored={() => shell.loadDocumentIntoView(activeTab.id, activeTab.resource!.rootPath!, activeTab.resource!.relativePath!)}
              />
            )}
            <TabContent tab={activeTab} document={activeDocument} onChange={shell.updateDocument} onSave={shell.saveDocument} noteIndex={shell.noteIndex} onOpenNote={shell.onOpenNote} onReopenNote={shell.loadDocumentIntoView} unsavedNoteContents={shell.unsavedNoteContents} />
          </article>
          {shell.bottomPanel && (
            <div className="animate-[tn-slide-in-bottom_var(--tn-duration-overlay)_ease-out_forwards]">
              <BottomPanelContent
                active={shell.bottomPanel}
                onChange={shell.updateBottomPanel}
                onClose={() => shell.updateBottomPanel(null)}
              />
            </div>
          )}
        </section>

        {rightPanel && (
          <>
            <ResizeHandle
              label="Resize right panel"
              onPointerDown={shell.resize.beginResize("right")}
              onPointerCancel={shell.resize.cancelResize}
              onDoubleClick={() => shell.resetPanelWidth("right")}
              onKeyDown={shell.resize.resizeWithKeyboard("right")}
            />
            <RightPopout
              panel={rightPanel}
              rootPath={shell.restoredWorkspacePath}
              documentContents={activeDocument?.phase === "ready"
                ? activeDocument.contents
                : null}
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
          onOpenFile={(file) => shell.openMarkdownDocument(file.rootPath, file.relativePath)}
        />
      )}
      <TabCloseRequest shell={shell} />
    </main>
  );
}
