import { normalizeRoot } from "@thinkbrain/core";
import { BottomSheet } from "@thinkbrain/ui";
import { useCallback, useEffect, useMemo, useRef } from "react";

import { BottomPanel } from "../../panels/BottomPanel";
import { LeftPopout } from "../../panels/LeftPopout";
import { getDesktopPanelOrUndefined } from "../../panels/panelRegistryModel";
import { editorTabId, fileTabId } from "../../tabs/tabModel";
import { isSelectableLeftPanel, isSelectableRightPanel } from "../shellTypes";
import { useSettingsStore } from "../../settings/settingsStore";
import { TabCloseRequest } from "../TabCloseRequest";
import { isNoteTitleEligible } from "../noteTitleEligibility";
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
  // every transient surface — navigation drawer, tab switcher, action-items
  // menu, inspector drawer — is an overlay entry on the same stack, so the
  // header Back and Android system Back both dismiss the topmost surface
  // before touching content history.
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
    runCommand: runPaletteCommand,
    clearVersions
  } = shell;

  const closeDrawer = useCallback(() => navigation.dismissOverlay(), [navigation]);

  // The journal root path — used to hide the note title row on journal
  // entries, which already show their own dateline via metadata-widget.
  const journalRoot = useSettingsStore(
    (s) => normalizeRoot(String(s.getEffectiveValue("extension-journal-calendar.root") ?? "journal"))
  );
  const activePath = activeTab?.resource?.relativePath ?? null;
  const showNoteTitle = isNoteTitleEligible(activeTab?.kind, activePath, journalRoot);

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

  // Same bag the desktop dock gets, minus the two open callbacks: file taps
  // must route through the history stack instead of only activating a tab.
  const explorerProps = useMemo(
    () => ({ ...shell.explorerProps, onMarkdownFileSelected: openMarkdown, onFileSelected: openFile }),
    [shell.explorerProps, openMarkdown, openFile]
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
        // overlay open it *replaces* the overlay's entry so switching New
        // note/Menu/inspector → Files/Search does not strand the old surface
        // under Back; over bare content it pushes. Tapping the slot for the
        // panel already on screen toggles back to the prior content; at the
        // Files root that Back is a safe no-op.
        const alreadyVisible =
          overlay === null &&
          (panelId === "explorer"
            ? route.kind === "files"
            : route.kind === "panel" && route.panel === panelId);
        const target: PhoneRoute =
          panelId === "explorer" ? { kind: "files" } : { kind: "panel", panel: panelId };
        if (alreadyVisible) {
          navigation.back();
        } else if (overlay !== null) {
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

  // A panel row tapped *inside the navigation drawer* replaces the drawer's
  // history entry with the content route instead of pushing over it — Back
  // then returns to the prior content, not to a dead drawer entry.
  const selectDrawerPanel = useCallback(
    (panelId: string) => {
      if (!isSelectableLeftPanel(panelId)) return;
      // Saved versions always opens the whole-workspace view — matching the
      // Action items entry point — never a stale note-specific filter.
      if (panelId === "history") clearVersions();
      navigation.replace(panelId === "explorer" ? { kind: "files" } : { kind: "panel", panel: panelId });
    },
    [navigation, clearVersions]
  );

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
  // name field is where the user is already looking. The popup's history
  // entry is replaced rather than pushed over, keeping Back honest.
  const createNewNote = useCallback(() => {
    navigation.replace({ kind: "files" });
    const command = paletteCommands.find((candidate) => candidate.id === "new-note");
    if (command) runPaletteCommand(command);
  }, [navigation, paletteCommands, runPaletteCommand]);

  // The most recent note is the active editor `.md`, else the last one in tab
  // order — "last open", not a filesystem timestamp.
  const recentNote = useMemo(() => {
    const isNoteTab = (tab: typeof activeTab): tab is NonNullable<typeof activeTab> =>
      tab?.kind === "editor" &&
      tab.resource?.relativePath?.toLowerCase().endsWith(".md") === true;
    const tabs = shell.tabState.tabs;
    const candidate = isNoteTab(activeTab) ? activeTab : [...tabs].reverse().find(isNoteTab);
    return candidate ? { id: candidate.id, title: candidate.title } : null;
  }, [activeTab, shell.tabState.tabs]);

  const openRecentNote = useCallback(() => {
    if (recentNote) navigation.replace({ kind: "tab", tabId: recentNote.id });
  }, [navigation, recentNote]);

  // Saved versions is the history panel with the version filter dropped so it
  // shows the whole workspace, not the last note asked. Replacing the menu's
  // entry means Back returns to prior content, never to a dead menu entry.
  const openSavedVersions = useCallback(() => {
    clearVersions();
    navigation.replace({ kind: "panel", panel: "history" });
  }, [clearVersions, navigation]);

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
  // see the note only while a tab is the visible route — on Files or a panel
  // a restored document must not leak into Outline/Properties context.
  const visibleDocumentContents =
    route.kind === "tab" && activeDocument?.phase === "ready"
      ? activeDocument.contents
      : null;
  // Browser-style location pill: workspace, then the route's own crumb trail —
  // real folders for file tabs (`.md` stripped only from note editors so
  // code/media keep their extension), a label for chrome surfaces.
  const workspaceLabel = shell.workspaceName ?? "ThinkBrain";
  const breadcrumbs = (() => {
    if (route.kind === "files") return [workspaceLabel, "Files"];
    if (route.kind === "panel") {
      return [workspaceLabel, getDesktopPanelOrUndefined(route.panel)?.label ?? route.panel];
    }
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
    <main
      className="relative flex h-full min-w-0 flex-col overflow-hidden bg-background text-foreground [--tn-shell-popout-left:0px]"
      aria-label="ThinkBrain mobile workspace"
    >
      <PhoneHeader
        breadcrumbs={breadcrumbs}
        canGoBack={navigation.canGoBack}
        canGoForward={navigation.canGoForward}
        tabCount={shell.tabState.tabs.length}
        onBack={navigation.back}
        onForward={navigation.forward}
        onOpenTabs={() => navigation.showOverlay({ kind: "tabs" })}
        onOpenInspector={() => navigation.showOverlay({ kind: "actions" })}
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
            versionsOf={shell.versionsOf}
            onShowEverything={clearVersions}
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
          // Replacing the switcher's entry with the tab route dismisses the
          // sheet and lands Back on the prior content in one step.
          navigation.replace({ kind: "tab", tabId });
        }}
        onClose={(tabId) => shell.dispatchTabs({ type: "requestClose", tabId })}
      />

      {/* The header `…` menu: every right-panel contribution in registry
          order. Choosing one opens its inspector as a child of this menu, so
          the inspector's Back returns here instead of to content. */}
      <ActionItemsMenu
        open={actionsOpen}
        rootPath={shell.restoredWorkspacePath}
        documentContents={visibleDocumentContents}
        onOpenSavedVersions={openSavedVersions}
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
        rootPath={shell.restoredWorkspacePath}
        documentContents={visibleDocumentContents}
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
        workspaceName={shell.workspaceName}
        onDismiss={closeDrawer}
        onSelectPanel={selectDrawerPanel}
        onLongPressPanel={(panelId) => editHub(pinPanel(items, panelId))}
        hubPanelIds={hubPanelIds}
        hubFull={items.length >= MAX_HUB_ITEMS}
        onOpenSettings={() => {
          shell.openSettingsTab();
          navigation.replace({ kind: "tab", tabId: "settings" });
        }}
      />
    </main>
  );
}
