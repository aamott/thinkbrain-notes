import { BottomSheet } from "@thinkbrain/ui";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { BottomPanel } from "../../panels/BottomPanel";
import { LeftPopout } from "../../panels/LeftPopout";
import { isSelectableLeftPanel, isSelectableRightPanel, type LeftPanel } from "../shellTypes";
import { TabCloseRequest } from "../TabCloseRequest";
import { TabContent } from "../TabContent";
import type { ShellState } from "../useShellState";
import { MAX_HUB_ITEMS, pinPanel, removeItem } from "./hubEditing";
import type { HubItem } from "./hubModel";
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
 *
 * It also publishes `--tn-shell-popout-left: 0px`. `Popout` insets itself by
 * the activity rail below 760px because a *narrow desktop window* still renders
 * one; phone chrome does not, so the reserved strip would be 3rem of nothing.
 */
export function PhoneShell({ shell }: { readonly shell: ShellState }) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  // The panel filling the screen, or null for the note. Typed rather than a
  // bare string so the content branch can render *this* panel instead of
  // guessing at the last one the shell selected.
  const [revealed, setRevealed] = useState<LeftPanel | null>(null);
  const [tabsOpen, setTabsOpen] = useState(false);
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const { items, setItems } = useHubItems();

  const closeDrawer = useCallback(() => setDrawerOpen(false), []);

  // Long press is the whole v1 customization affordance: hold a drawer row to
  // pin it, hold a hub slot to remove it. Both helpers hand back the identical
  // array when they decline, so a refused edit never costs a settings write —
  // and the drawer, not a toast, is what says why (its hint line and its
  // "Pinned" marks). Phone chrome renders no status bar to toast into.
  const editHub = useCallback(
    (next: readonly HubItem[]) => {
      if (next !== items) void setItems(next);
    },
    [items, setItems]
  );

  const hubPanelIds = useMemo(
    () => items.flatMap((item) => (item.kind === "panel" ? [item.id] : [])),
    [items]
  );

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

  // Mobile autosave: the phone shell has no Save button, so the document is
  // saved automatically after the user stops typing for 1.5s. The effect
  // watches the active document's contents and dirty flag — only a dirty
  // document triggers a save, and the timer is cancelled if the user keeps
  // typing or switches tabs before it fires.
  const autosaveRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (autosaveRef.current) {
      clearTimeout(autosaveRef.current);
      autosaveRef.current = null;
    }
    const tab = shell.activeTab;
    if (!tab?.isDirty) return;
    autosaveRef.current = setTimeout(() => {
      void shell.saveDocument(tab);
    }, 1500);
    return () => {
      if (autosaveRef.current) {
        clearTimeout(autosaveRef.current);
        autosaveRef.current = null;
      }
    };
  }, [shell.activeTab?.id, shell.activeTab?.isDirty, shell.activeDocument?.contents, shell]);

  return (
    <main
      className="relative flex h-full min-w-0 flex-col overflow-hidden bg-background text-foreground [--tn-shell-popout-left:0px]"
      aria-label="ThinkBrain mobile workspace"
    >
      <PhoneHeader
        title={shell.activeTab?.title ?? shell.workspaceName ?? "ThinkBrain"}
        canGoBack={revealed !== null}
        tabCount={shell.tabState.tabs.length}
        syncStatus={shell.syncStatus}
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
        // Not `revealPanel`: that one toggles, so tapping the pill while the
        // panel it names is already open would close it, and it skips the
        // version-filter reset `openSyncPanel` does for history. The pill
        // always means "show me this".
        onOpenSyncPanel={(panel) => {
          shell.openSyncPanel(panel);
          setInspectorOpen(false);
          setTabsOpen(false);
          setRevealed(panel);
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
          // drawer, which peeks at 86%. Slides in from the left so the reveal
          // reads as a panel pushing the note aside, not a pop.
          <div
            key={revealed}
            className="flex min-h-0 flex-1 flex-col animate-[tn-slide-in-left_var(--tn-duration-overlay)_ease-out_forwards]"
          >
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
          </div>
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
        onLongPress={(target) => editHub(removeItem(items, target))}
      />

      {/* Three bottom chromes do not fit on a phone and the hub owns that edge,
          so the bottom dock arrives as a sheet instead of a third band. */}
      <BottomSheet
        open={shell.bottomPanel !== null}
        onDismiss={() => shell.updateBottomPanel(null)}
        // Named for what it is rather than what it holds: the sheet wraps
        // BottomPanel's own region, which already carries "Bottom panel", and
        // a dialog echoing its only child's name reads twice to a screen reader.
        label="Tools"
      >
        {shell.bottomPanel && (
          <BottomPanel
            active={shell.bottomPanel}
            onChange={shell.updateBottomPanel}
            onClose={() => shell.updateBottomPanel(null)}
          />
        )}
      </BottomSheet>

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
        onLongPressPanel={(panelId) => editHub(pinPanel(items, panelId))}
        hubPanelIds={hubPanelIds}
        hubFull={items.length >= MAX_HUB_ITEMS}
        onOpenSettings={() => {
          shell.openSettingsTab();
          setDrawerOpen(false);
          setRevealed(null);
        }}
      />
    </main>
  );
}
