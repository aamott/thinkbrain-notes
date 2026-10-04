import { inferTabKind } from "@thinkbrain/core";
import { BottomSheet } from "@thinkbrain/ui";
import { useCallback, useEffect, useMemo, useRef } from "react";

import { BottomPanel } from "../../panels/BottomPanel";
import { LeftPopout } from "../../panels/LeftPopout";
import { getDesktopPanelOrUndefined, type RightPanelContext } from "../../panels/panelRegistryModel";
import { editorTabId, fileTabId, inspectableRelativePath, restoreBreadcrumbSegments, type DesktopTab } from "../../tabs/tabModel";
import { isSelectableLeftPanel, isSelectableRightPanel } from "../shellTypes";
import { TabCloseRequest } from "../TabCloseRequest";
import { useNoteTitle } from "../useNoteTitle";
import { TabContent } from "../TabContent";
import type { ShellState } from "../useShellState";
import { usePhoneNavigation, type PhoneRoute } from "./usePhoneNavigation";
import { MAX_HUB_ITEMS, pinPanel, removeItem } from "./hubEditing";
import type { HubItem } from "./hubModel";
import { ActionItemsMenu } from "./ActionItemsMenu";
import { InspectorSheet } from "./InspectorSheet";
import { PhoneDrawer } from "./PhoneDrawer";
import { PhoneHeader } from "./PhoneHeader";
import { NoteTitleRow } from "./NoteTitleRow";
import { PhoneHub } from "./PhoneHub";
import { TabSwitcherSheet } from "./TabSwitcherSheet";
import { useHubItems } from "./useHubItems";
import { WorkspaceSelectorProvider } from "../../workspace/WorkspaceSelectorPortal";

/** Only Markdown editor tabs count as notes — code/media/settings don't. */
const isNoteTab = (tab: DesktopTab | null | undefined): tab is DesktopTab =>
  tab?.kind === "editor" &&
  tab.resource?.relativePath?.toLowerCase().endsWith(".md") === true;

/**
 * Phone chrome over the shared shell state.
 *
 * Layout only: every piece of state here is `shell`, and every panel rendered is
 * the same component the desktop renders. What differs is the arrangement —
 * right-edge drawer instead of rail, hub instead of status bar, and a bounded
 * inspector drawer + anchored action-items menu instead of right-side docks.
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
  const { items, setItems } = useHubItems();

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

  // Callbacks and effects must take these as values, never `shell` itself:
  // useShellState returns a new object every render.
  const {
    activeTab,
    activeDocument,
    saveDocument,
    dispatchTabs,
    setLeftPanel,
    setRightPanel,
    openMarkdownDocument,
    openFileDocument,
    paletteCommands,
    runCommand: runPaletteCommand
  } = shell;

  // Journal entries render their own dateline, so the title row hides there —
  // same rule as DesktopShell. Only ordinary Markdown editor tabs get a title.
  const activePath = activeTab?.resource?.relativePath ?? null;
  const showNoteTitle = useNoteTitle(activeTab);

  // Route → tab/panel synchronization. A tab route *activates* its tab through
  // the shared reducer rather than carrying document state of its own; a stale
  // route (tab closed or renamed since the entry was pushed) is rewritten to
  // Files in place, so Back can never strand the user on a ghost entry.
  //
  // Keyed on `route` alone: the route is the authority here, and re-running on
  // tab changes would fight the observer below — when a new tab opens under a
  // tab route, activating the old route's tab and pushing the new active tab
  // ping-pong forever. Reconciliation on tab close/rename is the observer's
  // job, and it sees `openTabIds` through a ref.
  // Ref mirrors of the values the two effects below read between renders;
  // declared first so this sync runs before either consumer each commit.
  const routeRef = useRef<PhoneRoute>(route);
  const openTabIdsRef = useRef<ReadonlySet<string>>(new Set());
  const activeTabIdRef = useRef(shell.tabState.activeTabId);
  useEffect(() => {
    routeRef.current = route;
    openTabIdsRef.current = new Set(shell.tabState.tabs.map((tab) => tab.id));
    activeTabIdRef.current = shell.tabState.activeTabId;
  });

  useEffect(() => {
    if (route.kind === "tab") {
      if (openTabIdsRef.current.has(route.tabId)) {
        // `activate` returns a fresh state even for the already-active tab, so
        // dispatch only on a real change — otherwise this effect loops.
        if (activeTabIdRef.current !== route.tabId) {
          dispatchTabs({ type: "activate", tabId: route.tabId });
        }
        setLeftPanel(null);
      } else {
        navigation.replace({ kind: "files" });
      }
    } else {
      setLeftPanel(route.kind === "panel" ? route.panel : "explorer");
    }
  }, [route, dispatchTabs, setLeftPanel, navigation]);

  // Captures opens that bypass the phone wrappers — extension commands, the
  // workspace bridge, a conflict review — so every externally driven active-tab
  // change still lands on the Back stack. Restored tabs are seeded, not pushed:
  // a cold start with a restored session belongs at Files, not mid-stack.
  const observedTabIdRef = useRef<string | null>(null);
  const seededTabRef = useRef(false);
  const activeTabId = shell.tabState.activeTabId;
  const stateRestored = shell.stateRestored;
  useEffect(() => {
    if (!stateRestored) return;
    if (!seededTabRef.current) {
      seededTabRef.current = true;
      observedTabIdRef.current = activeTabId;
      return;
    }
    if (activeTabId === observedTabIdRef.current) return;
    observedTabIdRef.current = activeTabId;
    const current = routeRef.current;
    if (current.kind === "tab" && current.tabId === activeTabId) return;
    if (current.kind === "tab" && !openTabIdsRef.current.has(current.tabId)) {
      navigation.replace(activeTabId ? { kind: "tab", tabId: activeTabId } : { kind: "files" });
    } else if (activeTabId) {
      navigation.push({ kind: "tab", tabId: activeTabId });
    }
  }, [activeTabId, stateRestored, navigation]);

  // Opens that *do* pass through the phone chrome push explicitly, so the note
  // they land on is one history entry — not two. The observer above skips the
  // resulting active-tab change because the route already names the same tab.
  const openMarkdown = useCallback(
    (rootPath: string, relativePath: string) => {
      openMarkdownDocument(rootPath, relativePath);
      navigation.push({ kind: "tab", tabId: editorTabId({ rootPath, relativePath }) });
    },
    [openMarkdownDocument, navigation]
  );
  const openFile = useCallback(
    (rootPath: string, relativePath: string) => {
      openFileDocument(rootPath, relativePath);
      navigation.push({ kind: "tab", tabId: fileTabId({ rootPath, relativePath }) });
    },
    [openFileDocument, navigation]
  );
  const openNote = useCallback(
    (relativePath: string) => {
      if (shell.restoredWorkspacePath) openMarkdown(shell.restoredWorkspacePath, relativePath);
    },
    [shell.restoredWorkspacePath, openMarkdown]
  );

  // "Previous versions…" opens the file's inspector over the just-opened tab.
  // The desktop's shell callback only sets `rightPanel`, which phone chrome
  // does not read — inspectors exist here as navigation overlays. `push`
  // updates the entry ref synchronously, so `showOverlay` lands the inspector
  // on top of the new tab route rather than underneath it.
  const showVersions = useCallback(
    (rootPath: string, relativePath: string) => {
      if (inferTabKind(relativePath) === "editor") openMarkdown(rootPath, relativePath);
      else openFile(rootPath, relativePath);
      setRightPanel("history");
      navigation.showOverlay({ kind: "inspector", panel: "history", parent: "content" });
    },
    [openMarkdown, openFile, setRightPanel, navigation]
  );

  // Same bag the desktop dock gets, minus the two open callbacks and
  // `onShowVersions`: file taps and "Previous versions…" must route through
  // the history stack instead of only activating a tab.
  const explorerProps = useMemo(
    () => ({
      ...shell.explorerProps,
      onMarkdownFileSelected: openMarkdown,
      onFileSelected: openFile,
      onShowVersions: showVersions
    }),
    [shell.explorerProps, openMarkdown, openFile, showVersions]
  );

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
      // Asks the registry, not a literal list of the six first-party ids: an
      // extension's left panel is listed in the hub, so tapping it has to do
      // something.
      if (isSelectableLeftPanel(panelId)) {
        // A left panel takes over the screen — a content route. With an
        // inspector open it *replaces* the inspector's entry so switching
        // inspector → Files/Search does not strand the old surface under
        // Back; an ephemeral menu owns no entry, so the route pushes and the
        // menu just closes. Tapping the slot for the panel already on screen
        // toggles back to the prior content; at the Files root that Back is a
        // safe no-op.
        const alreadyVisible =
          overlay === null &&
          (panelId === "explorer"
            ? route.kind === "files"
            : route.kind === "panel" && route.panel === panelId);
        const target: PhoneRoute =
          panelId === "explorer" ? { kind: "files" } : { kind: "panel", panel: panelId };
        if (alreadyVisible) {
          navigation.back();
        } else if (overlay?.kind === "inspector") {
          navigation.replace(target);
        } else {
          navigation.push(target);
        }
      } else if (isSelectableRightPanel(panelId)) {
        // A right-side target is an inspector over the content, not a screen.
        // Tapping the slot for the inspector already open closes it; opened
        // directly from the hub it parents to content: Back returns to the
        // note, not to a menu. `showOverlay` swaps any open peer surface in
        // place rather than stacking it.
        if (inspectorPanel === panelId) {
          setRightPanel(null);
          navigation.dismissOverlay(true);
        } else {
          setRightPanel(panelId);
          navigation.showOverlay({ kind: "inspector", panel: panelId, parent: "content" });
        }
      }
    },
    [navigation, setRightPanel, overlay, route, inspectorPanel]
  );

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

  const runCommand = useCallback(
    (commandId: string) => {
      // New note is a toggle, not a fire-and-forget action: the slot opens a
      // popup offering create-or-reopen, and a second tap dismisses it.
      if (commandId === "new-note") {
        if (newNoteOpen) navigation.dismissOverlay();
        else navigation.showOverlay({ kind: "new-note" });
        return;
      }
      const command = paletteCommands.find((candidate) => candidate.id === commandId);
      if (command) runPaletteCommand(command);
      // Dismiss only a real overlay — with none open, dismissOverlay would
      // still Back-navigate the content route out from under the command.
      if (overlay !== null) navigation.dismissOverlay();
    },
    [paletteCommands, runPaletteCommand, navigation, newNoteOpen, overlay]
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

  // "Open most recent note" reads a two-entry MRU of distinct Markdown tabs
  // out of the reducer's activation history: `entries` is already the visit
  // order, `removeTab` scrubs closed ids and `retarget` follows renames, so
  // a second list here could only drift. While a note is on screen it
  // answers the *previous* note — A→B offers A, and reopening on A offers B
  // — while Files or a panel still gets the note currently open underneath.
  // Stale ids never reopen a closed tab.
  const recentNote = useMemo(() => {
    const tabs = shell.tabState.tabs;
    const findTab = (id: string | undefined): DesktopTab | undefined =>
      id !== undefined ? tabs.find((tab) => tab.id === id) : undefined;
    // Distinct note ids, most recently activated first.
    const noteIds: string[] = [];
    for (
      let index = shell.tabState.history.cursor;
      index >= 0 && noteIds.length < 2;
      index -= 1
    ) {
      const id = shell.tabState.history.entries[index];
      if (id !== undefined && !noteIds.includes(id) && isNoteTab(findTab(id))) {
        noteIds.push(id);
      }
    }
    const viewingNoteId =
      route.kind === "tab" && isNoteTab(activeTab) && route.tabId === activeTab.id
        ? activeTab.id
        : null;
    const candidate =
      viewingNoteId !== null
        ? findTab(noteIds.find((id) => id !== viewingNoteId))
        : (isNoteTab(activeTab) ? activeTab : findTab(noteIds[0]));
    return candidate ? { id: candidate.id, title: candidate.title } : null;
  }, [activeTab, route, shell.tabState]);

  const openRecentNote = useCallback(() => {
    if (recentNote) navigation.push({ kind: "tab", tabId: recentNote.id });
  }, [navigation, recentNote]);

  // Mobile autosave: the phone shell has no Save button, so the document is
  // saved automatically after the user stops typing for 1.5s. The effect
  // watches the active document's contents and dirty flag — only a dirty
  // document triggers a save, and the timer is cancelled if the user keeps
  // typing or switches tabs before it fires.
  //
  // Deps are destructed from `shell` because the shell object is a new literal
  // every render — depending on `shell` directly would reset the timer on
  // every render and the save would never fire under background state churn.
  const activeTabDirty = activeTab?.isDirty;
  const activeDocContents = activeDocument?.contents;
  const autosaveRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (autosaveRef.current) {
      clearTimeout(autosaveRef.current);
      autosaveRef.current = null;
    }
    if (!activeTabDirty || !activeTab) return;
    const tab = activeTab;
    autosaveRef.current = setTimeout(() => {
      void saveDocument(tab);
    }, 1500);
    return () => {
      if (autosaveRef.current) {
        clearTimeout(autosaveRef.current);
        autosaveRef.current = null;
      }
    };
  }, [activeTab, activeTabDirty, activeDocContents, saveDocument]);

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
  // availability gate reads the same values the inspector renders with.
  const rightContext: RightPanelContext = {
    rootPath: shell.restoredWorkspacePath,
    documentContents: visibleDocumentContents,
    documentPath: visibleDocumentPath,
    onOpenNote: openNote,
    onCompareVersion: shell.compareVersion,
    onRestoreVersion: shell.restoreVersionSafely
  };
  // Browser-style location pill: workspace, then the route's own crumb trail —
  // real folders for file tabs (`.md` stripped only from note editors so
  // code/media keep their extension), a label for chrome surfaces.
  const workspaceLabel = shell.workspaceName ?? "ThinkBrain";
  const breadcrumbs = (() => {
    if (route.kind === "files") return [workspaceLabel, "Files"];
    if (route.kind === "panel") {
      return [workspaceLabel, getDesktopPanelOrUndefined(route.panel)?.label ?? route.panel];
    }
    // A restore preview keeps its operation in the trail: workspace, then
    // "Restore", then the file's real path — extension kept, since the pill
    // names the file being restored, not a note title.
    const restoreSegments = restoreBreadcrumbSegments(activeTab);
    if (restoreSegments) return [workspaceLabel, ...restoreSegments];
    const relativePath = activeTab?.resource?.relativePath;
    if (!relativePath) return [workspaceLabel, activeTab?.title ?? workspaceLabel];
    const segments = relativePath.split("/").filter(Boolean);
    const last = segments.at(-1);
    if (activeTab?.kind === "editor" && last?.toLowerCase().endsWith(".md")) {
      segments[segments.length - 1] = last.slice(0, -".md".length);
    }
    return [workspaceLabel, ...segments];
  })();

  return (
    // `overflow-clip`, not `overflow-hidden`: closed always-mounted sheets
    // translated below the shell still enlarge this box's scrollable overflow,
    // and `hidden` leaves it programmatically scrollable — Android/WebView
    // focus-scroll can shift the whole shell and strand it (header off-screen,
    // black gap below). `clip` clips identically but cannot scroll.
    <WorkspaceSelectorProvider>
      <main
        className="relative flex h-full min-w-0 flex-col overflow-clip bg-background text-foreground [--tn-shell-popout-left:0px]"
        aria-label="ThinkBrain mobile workspace"
      >
        <PhoneHeader
          breadcrumbs={breadcrumbs}
          canGoBack={navigation.canGoBack}
          canGoForward={navigation.canGoForward}
          tabCount={shell.tabState.tabs.length}
          actionItemsOpen={actionsOpen}
          onBack={navigation.back}
          onForward={navigation.forward}
          onOpenTabs={() =>
            tabsOpen ? navigation.dismissOverlay() : navigation.showOverlay({ kind: "tabs" })
          }
          onToggleActionItems={() =>
            actionsOpen ? navigation.dismissOverlay() : navigation.showOverlay({ kind: "actions" })
          }
        />

        <div className="relative flex min-h-0 flex-1 flex-col">
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
            />
          </div>
        </div>

        <PhoneHub
          items={items}
          activeLeftPanel={route.kind === "tab" ? null : popoutPanel}
          // Only truthful while the inspector drawer is up: `rightPanel`
          // outlives it, and a hub slot left lit over a dismissed inspector
          // claims a surface is open.
          activeRightPanel={inspectorPanel}
          badges={shell.conflictBadges}
          menuOpen={drawerOpen}
          activeCommandId={newNoteOpen ? "new-note" : null}
          newNoteMenu={{
            open: newNoteOpen,
            recentNote,
            workspaceAvailable: shell.restoredWorkspacePath !== null,
            onCreate: createNewNote,
            onOpenRecent: openRecentNote,
            onDismiss: () => navigation.dismissOverlay()
          }}
          onSelectPanel={revealPanel}
          onRunCommand={runCommand}
          onOpenMenu={() =>
            drawerOpen ? navigation.dismissOverlay() : navigation.showOverlay({ kind: "navigation" })
          }
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
        />

        {/* The header `…` menu: every right-panel contribution in registry
            order. Choosing one opens its inspector as a child of this menu, so
            the inspector's Back returns here instead of to content. */}
        <ActionItemsMenu
          open={actionsOpen}
          context={rightContext}
          onDismiss={() => navigation.dismissOverlay()}
          onSelect={(panel) => {
            setRightPanel(panel);
            navigation.openOverlay({ kind: "inspector", panel, parent: "actions" });
          }}
        />

        {/* Inspectors read live shell state, so a tab switched underneath an open
            drawer re-renders it rather than stranding it on the previous note. */}
        <InspectorSheet
          open={inspectorPanel !== null}
          panel={inspectorPanel ?? shell.rightPanel ?? "outline"}
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
          onLongPressPanel={(panelId) => editHub(pinPanel(items, panelId))}
          hubPanelIds={hubPanelIds}
          hubFull={items.length >= MAX_HUB_ITEMS}
          onOpenSettings={() => {
            shell.openSettingsTab();
            navigation.replace({ kind: "tab", tabId: "settings" });
          }}
        />
      </main>
    </WorkspaceSelectorProvider>
  );
}
