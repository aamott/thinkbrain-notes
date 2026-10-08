import { BottomSheet, FloatingBubbles } from "@thinkbrain/ui";
import { EllipsisVertical, FilePlus2, Folder, FolderCog, FolderOpen, FolderPlus, House, Link, Plus, Search } from "lucide-react";
import { useCallback, useMemo, useState } from "react";

import { BottomPanel } from "../../panels/BottomPanel";
import { LeftPopout } from "../../panels/LeftPopout";
import {
  useRightPanelContributions,
  type RightPanelContext
} from "../../panels/panelRegistryModel";
import { usePanelNotificationCounts } from "../../notifications/usePanelNotificationCounts";
import { useSettingsStore } from "../../settings/settingsStore";
import { inspectableRelativePath, isNoteTab } from "../../tabs/tabModel";
import { isSelectableLeftPanel, type RightPanel } from "../shellTypes";
import { TabCloseRequest } from "../TabCloseRequest";
import { useNoteTitle } from "../useNoteTitle";
import { TabContent } from "../TabContent";
import type { ShellState } from "../useShellState";
import { usePhoneNavigation } from "./usePhoneNavigation";
import { resolveBubbles } from "./bubbleModel";
import { ActionItemsMenu } from "./ActionItemsMenu";
import { InspectorSheet } from "./InspectorSheet";
import { PhoneDrawer } from "./PhoneDrawer";
import { PhoneHeader } from "./PhoneHeader";
import { NewNoteMenu } from "./NewNoteMenu";
import { NoteTitleRow } from "./NoteTitleRow";
import { TabSwitcherSheet } from "./TabSwitcherSheet";
import { useSoftKeyboardOpen } from "./useSoftKeyboardOpen";
import { useNewNoteMenuActions } from "./useNewNoteMenuActions";
import { usePhoneAutosave } from "./usePhoneAutosave";
import { phoneBreadcrumbs } from "./phoneBreadcrumbs";
import { usePhoneOpeners } from "./usePhoneOpeners";
import { usePhoneRouteSync } from "./usePhoneRouteSync";
import { useRecentNote } from "./useRecentNote";
import { CREATE_MANAGED_WORKSPACE_LABEL, IMPORT_FROM_GIT_LABEL, MANAGE_WORKSPACES_LABEL, OPEN_FOLDER_LABEL } from "../../workspace/gitLinkImportCopy";
import { useWorkspaceOnboardingStore } from "../../workspace/workspaceOnboardingStore";
import { WorkspaceSelectorProvider } from "../../workspace/WorkspaceSelectorPortal";
import type { NewTabAction } from "../../tabs/NewTabView";

/**
 * Phone chrome over the shared shell state.
 *
 * Layout only: every piece of state here is `shell`, and every panel rendered is
 * the same component the desktop renders. What differs is the arrangement —
 * right-edge drawer instead of rail, floating bubbles instead of a status bar,
 * and a bounded inspector drawer + anchored action-items menu instead
 * of right-side docks.
 *
 * The root is `relative` and fills its box on purpose: `Drawer`, `BottomSheet`
 * and `Scrim` all position with `absolute`, so this element is the containing
 * block every phone overlay is measured against. `data-phone-shell` scopes the
 * bubble-clearance scroll padding in index.css to this chrome.
 *
 * It also publishes `--tn-shell-popout-left: 0px`. `Popout` insets itself by
 * the activity rail below 760px because a *narrow desktop window* still renders
 * one; phone chrome does not, so the reserved strip would be 3rem of nothing.
 * `--tn-phone-bubble-clearance` is the room the floating bubbles reserve at
 * the bottom of scrollable content.
 */
export function PhoneShell({ shell }: { readonly shell: ShellState }) {
  // Browser-history-backed navigation: Files is the root content route, and
  // the inspector drawer pushes onto the same stack so header Back and
  // Android system Back dismiss it before content history. The navigation
  // drawer, tab switcher, action-items menu and New-note popup are ephemeral
  // chrome state — Back closes them, and neither Back nor Forward can
  // resurrect them.
  const navigation = usePhoneNavigation(shell.restoredWorkspacePath);
  const route = navigation.route;
  const overlay = navigation.overlay;
  const drawerOpen = overlay?.kind === "navigation";
  const tabsOpen = overlay?.kind === "tabs";
  const actionsOpen = overlay?.kind === "actions";
  const newNoteOpen = overlay?.kind === "new-note";
  const inspectorPanel = overlay?.kind === "inspector" ? overlay.panel : null;
  // The sheet animates closed after its overlay entry is already gone, so it
  // still needs the last panel shown — never the desktop's right-panel state,
  // which phone chrome does not read. State adjusted during render (the
  // documented pattern for remembering a previous value).
  const [lastInspectorPanel, setLastInspectorPanel] = useState<RightPanel>("outline");
  const [seenInspectorPanel, setSeenInspectorPanel] = useState(inspectorPanel);
  if (inspectorPanel !== seenInspectorPanel) {
    setSeenInspectorPanel(inspectorPanel);
    if (inspectorPanel !== null) setLastInspectorPanel(inspectorPanel);
  }

  // Callbacks and effects must take these as values, never `shell` itself:
  // useShellState returns a new object every render.
  const {
    activeTab,
    activeDocument,
    saveDocument,
    dispatchTabs,
    setLeftPanel,
    openMarkdownDocument,
    openFileDocument,
    openNewTab: openNewTabDocument,
    paletteCommands,
    runCommand: runPaletteCommand
  } = shell;

  // Journal entries render their own dateline, so the title row hides there —
  // same rule as DesktopShell. Only ordinary Markdown editor tabs get a title.
  const activePath = activeTab?.resource?.relativePath ?? null;
  const showNoteTitle = useNoteTitle(activeTab);

  usePhoneRouteSync({
    route,
    navigation,
    tabState: shell.tabState,
    stateRestored: shell.stateRestored,
    dispatchTabs,
    setLeftPanel
  });

  const {
    openNewTab,
    openNote,
    createNewNote,
    explorerProps
  } = usePhoneOpeners({
    activeTab,
    saveDocument,
    openMarkdownDocument,
    openFileDocument,
    openNewTabDocument,
    restoredWorkspacePath: shell.restoredWorkspacePath,
    paletteCommands,
    runPaletteCommand,
    navigation,
    explorerProps: shell.explorerProps
  });

  const { recentNote, openRecentNote } = useRecentNote({
    tabState: shell.tabState,
    activeTab,
    route,
    navigation
  });

  usePhoneAutosave(activeTab, activeDocument?.contents, saveDocument);

  // A panel row tapped *inside the navigation drawer* replaces the current
  // entry with the content route instead of pushing over it — the drawer is
  // ephemeral chrome with no entry of its own, and a deliberate screen switch
  // from the menu should not leave Back a step into the surface it replaced.
  const selectDrawerPanel = useCallback(
    (panelId: string) => {
      if (!isSelectableLeftPanel(panelId)) return;
      navigation.replace(panelId === "explorer" ? { kind: "files" } : { kind: "panel", panel: panelId });
    },
    [navigation]
  );

  // Explorer-owned selector actions (Create vault, Git import, …) render their
  // dialogs inside the Files branch, so the drawer's entry is replaced with
  // Files first — otherwise the dialog mounts under the drawer/hidden note.
  const showFilesForWorkspaceAction = useCallback(() => {
    navigation.replace({ kind: "files" });
  }, [navigation]);

  // With no workspace open, the landing tab's job is direction: the same
  // create/open entry points the explorer's empty state shows, published by
  // the explorer's switching controller.
  const onboarding = useWorkspaceOnboardingStore((s) => s.actions);

  const runCommand = useCallback(
    (commandId: string) => {
      // "new-note" means create, the same as in the palette and the popup's
      // own Create row — one meaning for the id. The open-or-dismiss toggle
      // is the bubble's alone and lives on its onSelect.
      if (commandId === "new-note") {
        createNewNote();
      } else {
        const command = paletteCommands.find((candidate) => candidate.id === commandId);
        if (command) runPaletteCommand(command);
      }
      // Dismiss only a real overlay — with none open, dismissOverlay would
      // still Back-navigate the content route out from under the command.
      if (overlay !== null) navigation.dismissOverlay();
    },
    [paletteCommands, runPaletteCommand, navigation, createNewNote, overlay]
  );

  // The new-tab page's entry points, routed through phone navigation the same
  // way the bubbles and drawer reach those surfaces.
  const newTab = useMemo(() => {
    if (shell.workspaceName === null) {
      const viaFiles = (run: () => void) => () => {
        showFilesForWorkspaceAction();
        run();
      };
      const actions: NewTabAction[] = [];
      if (onboarding?.capabilities?.canCreateManagedWorkspace) {
        actions.push({ id: "create-vault", label: CREATE_MANAGED_WORKSPACE_LABEL, icon: <FolderPlus aria-hidden="true" className="size-4" />, onSelect: viaFiles(onboarding.createManagedVault) });
      }
      if (onboarding?.capabilities?.canOpenFolder) {
        actions.push({ id: "open-folder", label: OPEN_FOLDER_LABEL, icon: <FolderOpen aria-hidden="true" className="size-4" />, onSelect: viaFiles(onboarding.openFolder) });
      }
      if (onboarding) {
        actions.push({ id: "import-git", label: IMPORT_FROM_GIT_LABEL, icon: <Link aria-hidden="true" className="size-4" />, onSelect: viaFiles(onboarding.importFromGit) });
        for (const workspace of onboarding.workspaces) {
          if (workspace.missing) continue;
          actions.push({ id: `open:${workspace.rootPath}`, label: workspace.name, icon: <Folder aria-hidden="true" className="size-4" />, onSelect: () => onboarding.openPath(workspace.rootPath) });
        }
        actions.push({ id: "manage-workspaces", label: MANAGE_WORKSPACES_LABEL, icon: <FolderCog aria-hidden="true" className="size-4" />, onSelect: viaFiles(onboarding.manageWorkspaces) });
      }
      return { workspaceName: shell.workspaceName, actions };
    }
    return {
      workspaceName: shell.workspaceName,
      actions: [
        { id: "new-note", label: "New note", icon: <FilePlus2 aria-hidden="true" className="size-4" />, onSelect: createNewNote },
        { id: "files", label: "Browse files", icon: <FolderOpen aria-hidden="true" className="size-4" />, onSelect: () => navigation.push({ kind: "files" }) },
        { id: "search", label: "Search", icon: <Search aria-hidden="true" className="size-4" />, onSelect: () => navigation.push({ kind: "panel", panel: "search" }) }
      ]
    };
  }, [shell.workspaceName, createNewNote, navigation, onboarding, showFilesForWorkspaceAction]);

  // The panel LeftPopout renders: the route's panel, or explorer underneath
  // every tab route so Files is the base surface, not a blank space.
  const popoutPanel = route.kind === "panel" ? route.panel : "explorer";
  // Document-facing surfaces (action-items availability, inspector contents)
  // see the file only while a tab is the visible route — on Files or a panel
  // a restored document must not leak into Outline/Properties context. Any
  // file-backed tab counts — editor, code editor, media viewer — but never a
  // comparison tab, whose resource is what the comparison is about
  // (`inspectableRelativePath` applies that rule).
  const visibleDocumentContents =
    route.kind === "tab" && activeDocument?.phase === "ready"
      ? activeDocument.contents
      : null;
  const visibleDocumentPath =
    route.kind === "tab" ? inspectableRelativePath(activeTab) : null;
  // One context for both right-side surfaces: the action-items menu's
  // availability gate reads the same values the inspector renders with — and
  // the ⋮ bubble's own visibility counts the same availability.
  const rightContext: RightPanelContext = {
    rootPath: shell.restoredWorkspacePath,
    documentContents: visibleDocumentContents,
    documentPath: visibleDocumentPath,
    onOpenNote: openNote,
    onCompareVersion: shell.compareVersion,
    onRestoreVersion: shell.restoreVersionSafely
  };
  const workspaceLabel = shell.workspaceName ?? "ThinkBrain";
  // The routed tab, not `activeTab`: activating a route's tab and applying the
  // reducer's answer land in different commits, so for one render `activeTab`
  // still names the tab being navigated *from*. Looking the routed id up in
  // `tabState.tabs` reads the tab the route actually points at — the same
  // guard `useRecentNote` applies — with `activeTab` as the fallback while a
  // stale entry awaits reconciliation.
  const routedTab =
    route.kind === "tab"
      ? (shell.tabState.tabs.find((tab) => tab.id === route.tabId) ?? activeTab)
      : activeTab;
  const breadcrumbs = phoneBreadcrumbs(route, routedTab, workspaceLabel);

  // Floating bubbles: contextual bottom-corner actions over the content. The
  // ⋮ bubble exists only while at least one right panel resolves available,
  // counted against the same context the menu gates on.
  const rightPanels = useRightPanelContributions();
  const availableActionCount = rightPanels.filter(
    (entry) => entry.availability?.(rightContext) ?? true
  ).length;
  const viewingNote = route.kind === "tab" && isNoteTab(routedTab);

  // The Actions bubble wears the count of undismissed notifications aimed at
  // a registered right panel — the same rule the desktop title bar's ⋯ badge
  // applies, so an extension's notification surfaces identically on phone.
  const panelNotificationCounts = usePanelNotificationCounts();
  const actionsBadge = useMemo(() => {
    const rightIds = new Set<string>(rightPanels.map((entry) => entry.id));
    return [...panelNotificationCounts].reduce(
      (sum, [panel, count]) => (rightIds.has(panel) ? sum + count : sum),
      0
    );
  }, [panelNotificationCounts, rightPanels]);

  // Memoized on its primitive inputs so the identity stays stable and the
  // `bubbleItems` memo below actually caches between renders.
  const bubbleLayout = useMemo(
    () => resolveBubbles({ route, viewingNote, availableActionCount, actionsBadge }),
    [route, viewingNote, availableActionCount, actionsBadge]
  );

  // The ☰ button and the Home bubble both carry the conflict count — the
  // phone has no status bar to surface it anywhere else.
  const conflictCount = Object.values(shell.conflictBadges).reduce((sum, count) => sum + count, 0);

  // `ui.mobileBubbleLabels` turns the circles into labelled pills.
  const showBubbleLabels =
    useSettingsStore((state) => state.getEffectiveValue("ui.mobileBubbleLabels")) === true;

  const newNoteMenuActions = useNewNoteMenuActions(shell.restoredWorkspacePath !== null);
  const softKeyboardOpen = useSoftKeyboardOpen();

  // Bubbles float over content but not over chrome surfaces: hidden under the
  // drawer, the tab switcher, the inspector and the bottom-panel sheet — an
  // aria-modal surface must not leave them focusable beneath it — and under
  // the soft keyboard, where a bubble wedged between the keyboard and the
  // line being typed is worse than none. The two menus they trigger stay
  // visible while open.
  const bubblesVisible =
    !softKeyboardOpen &&
    shell.bottomPanel === null &&
    (overlay === null || overlay.kind === "actions" || overlay.kind === "new-note");

  const bubbleItems = useMemo(() => {
    const byId = {
      home: {
        key: "home",
        label: "Home",
        icon: <House aria-hidden="true" className="size-5" />,
        badge: conflictCount > 0 ? conflictCount : undefined,
        badgeLabel: "conflicts",
        // Push, not toggle: Back returns to the note the user came from.
        onSelect: () => navigation.push({ kind: "files" })
      },
      "new-note": {
        key: "new-note",
        label: "New note",
        icon: <Plus aria-hidden="true" className="size-5" />,
        variant: "primary" as const,
        hasPopup: true,
        active: newNoteOpen,
        onSelect: () =>
          newNoteOpen ? navigation.dismissOverlay() : navigation.showOverlay({ kind: "new-note" })
      },
      actions: {
        key: "actions",
        label: "Actions",
        icon: <EllipsisVertical aria-hidden="true" className="size-5" />,
        hasPopup: true,
        active: actionsOpen,
        badge: actionsBadge > 0 ? actionsBadge : undefined,
        badgeLabel: "notifications",
        onSelect: () =>
          actionsOpen ? navigation.dismissOverlay() : navigation.showOverlay({ kind: "actions" })
      }
    };
    return {
      left: bubbleLayout.left.map((id) => byId[id]),
      right: bubbleLayout.right.map((id) => byId[id])
    };
  }, [bubbleLayout, conflictCount, newNoteOpen, actionsOpen, actionsBadge, navigation]);

  return (
    // `overflow-clip`, not `overflow-hidden`: closed always-mounted sheets
    // translated below the shell still enlarge this box's scrollable overflow,
    // and `hidden` leaves it programmatically scrollable — Android/WebView
    // focus-scroll can shift the whole shell and strand it (header off-screen,
    // black gap below). `clip` clips identically but cannot scroll.
    <WorkspaceSelectorProvider>
      <main
        data-phone-shell
        className="relative flex h-full min-w-0 flex-col overflow-clip bg-background text-foreground [--tn-shell-popout-left:0px] [--tn-phone-bubble-clearance:calc(4.5rem+env(safe-area-inset-bottom))]"
        aria-label="ThinkBrain mobile workspace"
      >
        <PhoneHeader
          breadcrumbs={breadcrumbs}
          canGoBack={navigation.canGoBack}
          canGoForward={navigation.canGoForward}
          tabCount={shell.tabState.tabs.length}
          mainMenuOpen={drawerOpen}
          badge={conflictCount}
          onBack={navigation.back}
          onForward={navigation.forward}
          onOpenTabs={() =>
            tabsOpen ? navigation.dismissOverlay() : navigation.showOverlay({ kind: "tabs" })
          }
          onToggleMainMenu={() =>
            drawerOpen ? navigation.dismissOverlay() : navigation.showOverlay({ kind: "navigation" })
          }
        />

        {/* `isolate` confines the popout's `z-30` (and any in-panel overlays)
            to this stacking context so the floating bubbles always paint above
            route content while the z-30 menu-dismiss layers still sit above
            the bubbles. */}
        <div className="relative isolate flex min-h-0 flex-1 flex-col">
          {/* Both branches stay mounted and trade `hidden`/`aria-hidden` instead
              of unmounting: Explorer's expanded folders, selection and scroll —
              and every other keepMounted panel — survive a trip into a note and
              back, and the editor keeps its own state under a panel the same
              way. The classes, not the `hidden` attribute alone, carry the
              hiding because `display:flex` would override it. */}
          <div
            className={`min-h-0 flex-1 flex-col tn-slide-in-left ${route.kind === "tab" ? "hidden" : "flex"}`}
            aria-hidden={route.kind === "tab"}
          >
            <LeftPopout
              panel={popoutPanel}
              rootPath={shell.restoredWorkspacePath}
              explorerProps={explorerProps}
              onReviewConflict={shell.reviewConflict}
              onOpenSyncSettings={shell.openSyncSettings}
              onOpenSearchResult={openNote}
            />
          </div>
          <div
            className={`min-h-0 flex-1 flex-col ${route.kind === "tab" ? "flex" : "hidden"}`}
            aria-hidden={route.kind !== "tab"}
          >
            {showNoteTitle && (
              <NoteTitleRow
                key={activePath}
                relativePath={activePath}
                onRename={shell.restoredWorkspacePath
                  ? (newPath) => shell.renameDocument(shell.restoredWorkspacePath!, activePath!, newPath)
                  : undefined}
              />
            )}
            <TabContent
              tab={shell.activeTab}
              document={shell.activeDocument}
              onChange={shell.updateDocument}
              onSave={shell.saveDocument}
              noteIndex={shell.noteIndex}
              onOpenNote={openNote}
              onReopenNote={shell.loadDocumentIntoView}
              unsavedNoteContents={shell.unsavedNoteContents}
              onRestoreVersion={shell.restoreVersionSafely}
              newTab={newTab}
            />
          </div>
        </div>

        {bubblesVisible && (
          <FloatingBubbles
            label="Quick actions"
            left={bubbleItems.left}
            right={bubbleItems.right}
            showLabels={showBubbleLabels}
          />
        )}

        {/* The New-note bubble's popup: rendered at shell level so it anchors
            to the bubble group, not to any single bubble. */}
        <NewNoteMenu
          open={newNoteOpen}
          recentNote={recentNote}
          actions={newNoteMenuActions.actions}
          onCreate={createNewNote}
          onOpenRecent={openRecentNote}
          onSelectAction={(id) => {
            // Actions are pointers to canonical commands; run through the same
            // path as every other command, never a bespoke execution.
            const commandId = newNoteMenuActions.commandIdFor(id);
            if (commandId) runCommand(commandId);
          }}
          onDismiss={() => navigation.dismissOverlay()}
        />

        {/* Three bottom chromes do not fit on a phone and the bubbles own that
            edge, so the bottom dock arrives as a sheet instead of a third band. */}
        <BottomSheet
          open={shell.bottomPanel !== null}
          onDismiss={() => shell.updateBottomPanel(null)}
          // Named for what it is rather than what it holds: the sheet wraps
          // BottomPanel's own region, which already carries "Bottom panel", and
          // a dialog echoing its only child's name reads twice to a screen reader.
          label="Tools"
        >
          {/* Always mounted, matching InspectorSheet: `open` drives the slide,
              so unmounting on dismiss would empty the sheet mid-animation.
              Only `terminal` exists today; keep the last id if more arrive. */}
          <BottomPanel
            active={shell.bottomPanel ?? "terminal"}
            onChange={shell.updateBottomPanel}
            onClose={() => shell.updateBottomPanel(null)}
          />
        </BottomSheet>

        <TabSwitcherSheet
          open={tabsOpen}
          tabs={shell.tabState.tabs}
          activeTabId={shell.tabState.activeTabId}
          documents={shell.documents}
          onDismiss={() => navigation.dismissOverlay()}
          onSelect={(tabId) => {
            // The switcher is ephemeral chrome, not a history entry: choosing
            // a tab is the navigation, so push it — Back then revisits the
            // tab switched from (reselecting the current tab just closes).
            navigation.push({ kind: "tab", tabId });
          }}
          onClose={(tabId) => shell.dispatchTabs({ type: "requestClose", tabId })}
          onNewTab={openNewTab}
        />

        {/* The ⋮ bubble's menu: every right-panel contribution in registry
            order. Choosing one opens its inspector as a child of this menu, so
            the inspector's Back returns here instead of to content. */}
        <ActionItemsMenu
          open={actionsOpen}
          context={rightContext}
          onDismiss={() => navigation.dismissOverlay()}
          onSelect={(panel) => {
            navigation.pushOverlay({ kind: "inspector", panel, parent: "actions" });
          }}
        />

        {/* Inspectors read live shell state, so a tab switched underneath an open
            drawer re-renders it rather than stranding it on the previous note. */}
        <InspectorSheet
          open={inspectorPanel !== null}
          panel={inspectorPanel ?? lastInspectorPanel}
          context={rightContext}
          // Scrim tap closes the whole flow — under the actions menu that skips
          // the menu entry too; only the header Back steps one level.
          onDismiss={() => navigation.dismissOverlay(true)}
          onBack={navigation.back}
        />

        {/* Closing a dirty tab parks a request and waits for an answer. Without
            this the phone's ✕ would do nothing at all, and the parked request
            would make every later attempt on that tab a no-op too. */}
        <TabCloseRequest shell={shell} />

        <PhoneDrawer
          open={drawerOpen}
          activePanel={shell.leftPanel}
          badges={shell.conflictBadges}
          onDismiss={navigation.dismissOverlay}
          onSelectPanel={selectDrawerPanel}
          onWorkspaceAction={showFilesForWorkspaceAction}
          onOpenSettings={() => {
            shell.openSettingsTab();
            navigation.replace({ kind: "tab", tabId: "settings" });
          }}
        />
      </main>
    </WorkspaceSelectorProvider>
  );
}
