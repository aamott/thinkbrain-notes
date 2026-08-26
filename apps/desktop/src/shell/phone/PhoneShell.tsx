import { useCallback, useState } from "react";

import { LeftPopout } from "../../panels/LeftPopout";
import { isBuiltInLeftPanel } from "../../panels/panelRegistryModel";
import { isSelectableRightPanel } from "../shellTypes";
import { TabContent } from "../TabContent";
import type { ShellState } from "../useShellState";
import { PhoneDrawer } from "./PhoneDrawer";
import { PhoneHeader } from "./PhoneHeader";
import { PhoneHub } from "./PhoneHub";
import { TabSwitcherSheet } from "./TabSwitcherSheet";
import { useHubItems } from "./useHubItems";

/**
 * Phone chrome over the shared shell state.
 *
 * Layout only: every piece of state here is `shell`, and every panel rendered is
 * the same component the desktop renders. What differs is the arrangement —
 * drawer instead of rail, hub instead of status bar, sheets instead of docks.
 *
 * The root is `relative` and fills its box on purpose: `Drawer`, `BottomSheet`
 * and `Scrim` all position with `absolute`, so this element is the containing
 * block every phone overlay is measured against.
 */
export function PhoneShell({ shell }: { readonly shell: ShellState }) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [revealed, setRevealed] = useState<string | null>(null);
  const [tabsOpen, setTabsOpen] = useState(false);
  const { items } = useHubItems();

  const closeDrawer = useCallback(() => setDrawerOpen(false), []);

  const revealPanel = useCallback(
    (panelId: string) => {
      setDrawerOpen(false);
      // Toggle: tapping the hub slot you are already on returns you to the note.
      setRevealed((current) => (current === panelId ? null : panelId));
      if (isBuiltInLeftPanel(panelId)) shell.selectLeftPanel(panelId);
      else if (isSelectableRightPanel(panelId)) shell.setRightPanel(panelId);
    },
    [shell]
  );

  const runCommand = useCallback(
    (commandId: string) => {
      const command = shell.paletteCommands.find((candidate) => candidate.id === commandId);
      if (command) shell.runCommand(command);
      setDrawerOpen(false);
      setRevealed(null);
    },
    [shell]
  );

  return (
    <main
      className="relative flex h-full min-w-0 flex-col overflow-hidden bg-background text-foreground"
      aria-label="ThinkBrain mobile workspace"
    >
      <PhoneHeader
        title={shell.activeTab?.title ?? shell.workspaceName ?? "ThinkBrain"}
        canGoBack={revealed !== null}
        tabCount={shell.tabState.tabs.length}
        onBack={() => setRevealed(null)}
        onOpenNavigation={() => setDrawerOpen(true)}
        onOpenTabs={() => setTabsOpen(true)}
        onOpenInspector={() => undefined}
      />

      <div className="relative flex min-h-0 flex-1 flex-col">
        {revealed === null ? (
          <TabContent
            tab={shell.activeTab}
            document={shell.activeDocument}
            onChange={shell.updateDocument}
            onSave={shell.saveDocument}
            noteIndex={shell.noteIndex}
            onOpenNote={shell.onOpenNote}
            onReopenNote={shell.loadDocumentIntoView}
            unsavedNoteContents={shell.unsavedNoteContents}
          />
        ) : (
          // Content takes over: full width between header and hub, unlike the
          // drawer, which peeks at 86%.
          <LeftPopout
            panel={shell.leftPanel ?? "explorer"}
            rootPath={shell.restoredWorkspacePath}
            explorerProps={shell.explorerProps}
            onReviewConflict={shell.reviewConflict}
            versionsOf={shell.versionsOf}
            onShowEverything={shell.clearVersions}
            onOpenSearchResult={(relativePath) => {
              if (shell.restoredWorkspacePath) {
                shell.openMarkdownDocument(shell.restoredWorkspacePath, relativePath);
                setRevealed(null);
              }
            }}
          />
        )}
      </div>

      <PhoneHub
        items={items}
        activeLeftPanel={revealed}
        activeRightPanel={shell.rightPanel}
        badges={shell.conflictBadges}
        onSelectPanel={revealPanel}
        onRunCommand={runCommand}
        onOpenMenu={() => setDrawerOpen(true)}
      />

      <TabSwitcherSheet
        open={tabsOpen}
        tabs={shell.tabState.tabs}
        activeTabId={shell.tabState.activeTabId}
        documents={shell.documents}
        onDismiss={() => setTabsOpen(false)}
        onSelect={(tabId) => {
          shell.dispatchTabs({ type: "activate", tabId });
          // A tab is the note, not a panel: choosing one leaves whatever panel
          // was revealed and puts the editor back on screen.
          setRevealed(null);
        }}
        onClose={(tabId) => shell.dispatchTabs({ type: "requestClose", tabId })}
      />

      <PhoneDrawer
        open={drawerOpen}
        activePanel={shell.leftPanel}
        badges={shell.conflictBadges}
        workspaceName={shell.workspaceName}
        onDismiss={closeDrawer}
        onSelectPanel={revealPanel}
        onOpenSettings={() => {
          shell.openSettingsTab();
          setDrawerOpen(false);
          setRevealed(null);
        }}
      />
    </main>
  );
}
