import { useCallback, useState } from "react";

import { LeftPopout } from "../../panels/LeftPopout";
import { isSelectableLeftPanel, isSelectableRightPanel, type LeftPanel } from "../shellTypes";
import { TabCloseRequest } from "../TabCloseRequest";
import { TabContent } from "../TabContent";
import type { ShellState } from "../useShellState";
import { InspectorSheet } from "./InspectorSheet";
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
  // The panel filling the screen, or null for the note. Typed rather than a
  // bare string so the content branch can render *this* panel instead of
  // guessing at the last one the shell selected.
  const [revealed, setRevealed] = useState<LeftPanel | null>(null);
  const [tabsOpen, setTabsOpen] = useState(false);
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const { items } = useHubItems();

  const closeDrawer = useCallback(() => setDrawerOpen(false), []);

  const revealPanel = useCallback(
    (panelId: string) => {
      setDrawerOpen(false);
      // Asks the registry, not a literal list of the six first-party ids: an
      // extension's left panel is listed in the drawer, so tapping it has to
      // do something.
      if (isSelectableLeftPanel(panelId)) {
        // Toggle: tapping the hub slot you are already on returns you to the
        // note. A left panel takes over the screen, so any open sheet goes.
        setInspectorOpen(false);
        setRevealed((current) => (current === panelId ? null : panelId));
        shell.selectLeftPanel(panelId);
      } else if (isSelectableRightPanel(panelId)) {
        // A right-side target is an inspector, not a screen: it opens over the
        // note rather than replacing it. Revealing it would have shown the
        // *left* popout instead, since that is all the content branch renders.
        shell.setRightPanel(panelId);
        setInspectorOpen(true);
      }
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
        onOpenTabs={() => {
          setInspectorOpen(false);
          setTabsOpen(true);
        }}
        onOpenInspector={() => {
          setTabsOpen(false);
          setInspectorOpen(true);
        }}
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
            panel={revealed}
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
        // Only truthful while the sheet is up: `rightPanel` outlives it, and a
        // hub slot left lit over a dismissed sheet claims a surface is open.
        activeRightPanel={inspectorOpen ? shell.rightPanel : null}
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

      {/* Inspectors read live shell state, so a tab switched underneath an open
          sheet re-renders it rather than stranding it on the previous note. */}
      <InspectorSheet
        open={inspectorOpen}
        panel={shell.rightPanel ?? "outline"}
        rootPath={shell.restoredWorkspacePath}
        documentContents={
          shell.activeDocument?.phase === "ready" ? shell.activeDocument.contents : null
        }
        onDismiss={() => setInspectorOpen(false)}
        onSelectPanel={(panel) => shell.setRightPanel(panel)}
      />

      {/* Closing a dirty tab parks a request and waits for an answer. Without
          this the phone's ✕ would do nothing at all, and the parked request
          would make every later attempt on that tab a no-op too. */}
      <TabCloseRequest shell={shell} />

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
