// @vitest-environment happy-dom
import { act, useCallback, useReducer, useState, type Dispatch, type SetStateAction } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";

import {
  createEditorTab,
  currentVisit,
  desktopTabReducer,
  editorTabId,
  findVisit,
  initialDesktopTabState,
  type DesktopTab,
  type DesktopTabAction,
  type DesktopTabState,
  type EditorLocation
} from "../../tabs/tabModel";
import type { LeftPanel } from "../shellTypes";
import { usePhoneNavigation, type PhoneNavigation } from "./usePhoneNavigation";
import { usePhoneRouteSync } from "./usePhoneRouteSync";

/**
 * Hook-level reconciliation tests: a real {@link usePhoneNavigation} browser
 * stack wired to a real `desktopTabReducer` through {@link usePhoneRouteSync},
 * with `goToVisit` playing `ShellState.goToVisit`'s dispatch-level role
 * (`restoreVisit` — a revisit, never a new visit).
 */

let root: Root | null = null;
let container: HTMLDivElement | null = null;

afterEach(async () => {
  await act(async () => root?.unmount());
  container?.remove();
  root = null;
  container = null;
});

interface ProbeHandle {
  readonly navigation: PhoneNavigation;
  readonly tabState: DesktopTabState;
  readonly dispatch: Dispatch<DesktopTabAction>;
}

const noteTab = (relativePath: string): DesktopTab =>
  createEditorTab({ rootPath: "/vault", relativePath });

/** The routed depth written into the current history entry. */
const historyDepth = (): number | undefined =>
  (window.history.state as { depth?: number } | null)?.depth;

const renderSync = async (): Promise<() => ProbeHandle> => {
  const box: { current: ProbeHandle | null } = { current: null };
  const Probe = () => {
    const [tabState, dispatch] = useReducer(desktopTabReducer, initialDesktopTabState);
    // Same integration PhoneShell passes: visit liveness answers from the
    // current history so closes scrub routes out of Back/Forward reach.
    const navigation = usePhoneNavigation("/vault", {
      isVisitLive: (visitId) => findVisit(tabState.history, visitId) !== null
    });
    // Same wrapping PhoneShell applies: the phone's one-slot restore.
    const goToVisit = useCallback(
      (visitId: number) => dispatch({ type: "restoreVisit", visitId, placement: "replace-active" }),
      []
    );
    const [, setLeftPanel] = useState<LeftPanel | null>(null);
    usePhoneRouteSync({
      route: navigation.route,
      navigation,
      tabState,
      stateRestored: true,
      dispatchTabs: dispatch,
      goToVisit,
      setLeftPanel: setLeftPanel as Dispatch<SetStateAction<LeftPanel | null>>
    });
    box.current = { navigation, tabState, dispatch };
    return null;
  };
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => {
    root?.render(<Probe />);
  });
  return () => {
    if (!box.current) throw new Error("hook did not render");
    return box.current;
  };
};

const jump: EditorLocation = { anchor: 40, head: 40, scrollPos: 40 };

describe("usePhoneRouteSync", () => {
  it("binds a core-driven open to a pushed phone entry", async () => {
    const probe = await renderSync();

    // An open that bypasses the phone openers (a command, a bridge) still
    // becomes one bound browser entry — never two.
    await act(async () => probe().dispatch({ type: "open", tab: noteTab("a.md") }));

    const visit = currentVisit(probe().tabState.history);
    expect(probe().navigation.route).toEqual({
      kind: "tab",
      tabId: editorTabId({ rootPath: "/vault", relativePath: "a.md" }),
      visitId: visit?.id
    });
    expect(historyDepth()).toBe(1);
  });

  it("binds an explicit opener's unbound route to the new visit in place", async () => {
    const probe = await renderSync();
    const tabId = editorTabId({ rootPath: "/vault", relativePath: "a.md" });

    // The opener dispatches and pushes in one batch, before the new visit id
    // can be known — the sync binds, it does not push a second entry.
    await act(async () => {
      probe().dispatch({ type: "open", tab: noteTab("a.md") });
      probe().navigation.push({ kind: "tab", tabId });
    });

    const visit = currentVisit(probe().tabState.history);
    expect(probe().navigation.route).toEqual({ kind: "tab", tabId, visitId: visit?.id });
    expect(historyDepth()).toBe(1);
  });

  it("binds without dropping an inspector opened alongside the push", async () => {
    const probe = await renderSync();
    const tabId = editorTabId({ rootPath: "/vault", relativePath: "a.md" });

    await act(async () => {
      probe().dispatch({ type: "open", tab: noteTab("a.md") });
      probe().navigation.push({ kind: "tab", tabId });
      probe().navigation.pushOverlay({ kind: "inspector", panel: "outline", parent: "content" });
    });

    expect(probe().navigation.overlay).toEqual({
      kind: "inspector",
      panel: "outline",
      parent: "content"
    });
    expect(historyDepth()).toBe(2);
  });

  it("pushes a new phone entry for a same-document jump", async () => {
    const probe = await renderSync();
    await act(async () => probe().dispatch({ type: "open", tab: noteTab("a.md") }));
    const firstVisit = currentVisit(probe().tabState.history);

    await act(async () => probe().dispatch({ type: "navigateToLocation", location: jump }));

    const jumpedVisit = currentVisit(probe().tabState.history);
    expect(jumpedVisit?.id).not.toBe(firstVisit?.id);
    expect(probe().navigation.route).toEqual({
      kind: "tab",
      tabId: editorTabId({ rootPath: "/vault", relativePath: "a.md" }),
      visitId: jumpedVisit?.id
    });
    expect(historyDepth()).toBe(2);
  });

  it("restores the popped visit without recording a new one", async () => {
    const probe = await renderSync();
    await act(async () => probe().dispatch({ type: "open", tab: noteTab("a.md") }));
    const firstVisit = currentVisit(probe().tabState.history);
    await act(async () => probe().dispatch({ type: "navigateToLocation", location: jump }));
    expect(probe().tabState.history.entries).toHaveLength(2);

    await act(async () => probe().navigation.back());

    // The revisit moved the cursor — it did not append.
    expect(currentVisit(probe().tabState.history)?.id).toBe(firstVisit?.id);
    expect(probe().tabState.history.entries).toHaveLength(2);
    expect(probe().navigation.canGoForward).toBe(true);

    // Forward walks the same location log back to the jump.
    await act(async () => probe().navigation.forward());
    expect(currentVisit(probe().tabState.history)?.id).not.toBe(firstVisit?.id);
    expect(probe().tabState.history.entries).toHaveLength(2);
  });

  it("consumes the inspector's slot when a same-document jump lands under it", async () => {
    const probe = await renderSync();
    await act(async () => probe().dispatch({ type: "open", tab: noteTab("a.md") }));
    const preJumpVisit = currentVisit(probe().tabState.history);
    await act(async () =>
      probe().navigation.pushOverlay({ kind: "inspector", panel: "outline", parent: "content" })
    );
    expect(historyDepth()).toBe(2);

    // The outline tap records a visit while its sheet owns the top entry:
    // the jump takes the sheet's slot so the sheet is gone and Back reaches
    // the bare pre-jump visit — not the sheet that caused the jump.
    await act(async () => probe().dispatch({ type: "navigateToLocation", location: jump }));

    const jumpedVisit = currentVisit(probe().tabState.history);
    expect(probe().navigation.overlay).toBeNull();
    expect(probe().navigation.route).toEqual({
      kind: "tab",
      tabId: editorTabId({ rootPath: "/vault", relativePath: "a.md" }),
      visitId: jumpedVisit?.id
    });
    expect(historyDepth()).toBe(2);

    await act(async () => probe().navigation.back());
    expect(probe().navigation.route).toEqual({
      kind: "tab",
      tabId: editorTabId({ rootPath: "/vault", relativePath: "a.md" }),
      visitId: preJumpVisit?.id
    });
    expect(currentVisit(probe().tabState.history)?.id).toBe(preJumpVisit?.id);
  });

  it("re-points the bound route when the visit's descriptor moves (rename)", async () => {
    const probe = await renderSync();
    const tabA = noteTab("a.md");
    await act(async () => {
      probe().dispatch({ type: "open", tab: tabA });
      probe().navigation.push({ kind: "tab", tabId: tabA.id });
    });
    const visit = currentVisit(probe().tabState.history);

    await act(async () =>
      probe().dispatch({
        type: "retarget",
        from: { rootPath: "/vault", relativePath: "a.md" },
        to: { rootPath: "/vault", relativePath: "renamed.md" }
      })
    );

    // The visit kept its id and moved to the new descriptor — the route
    // follows in place, so Back/Forward still count the same entries.
    const renamedId = editorTabId({ rootPath: "/vault", relativePath: "renamed.md" });
    expect(probe().navigation.route).toEqual({ kind: "tab", tabId: renamedId, visitId: visit?.id });
    expect(historyDepth()).toBe(1);
  });

  it("rewrites a dead routed visit to the survivor visit in place", async () => {
    const probe = await renderSync();
    const tabA = noteTab("a.md");
    const tabB = noteTab("b.md");
    await act(async () => probe().dispatch({ type: "open", tab: tabA }));
    await act(async () => probe().dispatch({ type: "open", tab: tabB }));
    const routeBefore = probe().navigation.route;
    expect(routeBefore.kind).toBe("tab");
    expect(historyDepth()).toBe(2);

    // An explicit close scrubs B's visits; the route the browser entry named
    // is rewritten to the survivor — it must never reopen B.
    await act(async () => probe().dispatch({ type: "requestClose", tabId: tabB.id }));

    const survivor = currentVisit(probe().tabState.history);
    expect(probe().navigation.route).toEqual({
      kind: "tab",
      tabId: tabA.id,
      visitId: survivor?.id
    });
    expect(historyDepth()).toBe(2);
    expect(probe().tabState.tabs).toHaveLength(1);
  });

  it("reopens a displaced tab through its retained visit", async () => {
    const probe = await renderSync();
    await act(async () => probe().dispatch({ type: "open", tab: noteTab("a.md") }));
    const visitA = currentVisit(probe().tabState.history);
    // Preview/replace-active takeover is navigation, not close: A's visit is
    // retained even though its tab leaves the strip.
    await act(async () =>
      probe().dispatch({ type: "open", tab: noteTab("b.md"), placement: "replace-active" })
    );
    expect(probe().tabState.tabs).toHaveLength(1);
    expect(historyDepth()).toBe(2);

    // Back pops to A's bound visit; the restore refills B's slot with A's
    // retained descriptor — the phone's one surface, not a second strip entry.
    await act(async () => probe().navigation.back());

    expect(probe().navigation.route).toMatchObject({ kind: "tab", visitId: visitA?.id });
    expect(currentVisit(probe().tabState.history)?.id).toBe(visitA?.id);
    expect(probe().tabState.tabs).toHaveLength(1);
    expect(probe().tabState.activeTabId).toBe(
      editorTabId({ rootPath: "/vault", relativePath: "a.md" })
    );
  });

  it("never displaces a dirty tab to restore a displaced visit", async () => {
    const probe = await renderSync();
    await act(async () => probe().dispatch({ type: "open", tab: noteTab("a.md") }));
    await act(async () =>
      probe().dispatch({ type: "open", tab: noteTab("b.md"), placement: "replace-active" })
    );
    const tabB = probe().tabState.tabs[0]!.id;
    await act(async () => probe().dispatch({ type: "setDirty", tabId: tabB, isDirty: true }));

    // B holds unsaved work: restoring A must append its descriptor rather
    // than take over B's slot.
    await act(async () => probe().navigation.back());

    expect(probe().tabState.tabs).toHaveLength(2);
    expect(probe().tabState.tabs.find((tab) => tab.id === tabB)?.isDirty).toBe(true);
    expect(probe().tabState.activeTabId).toBe(
      editorTabId({ rootPath: "/vault", relativePath: "a.md" })
    );
  });

  it("observes a background activation from Files as one bound entry", async () => {
    const probe = await renderSync();
    const tabA = noteTab("a.md");
    const tabB = noteTab("b.md");
    await act(async () => probe().dispatch({ type: "open", tab: tabA }));
    await act(async () => probe().dispatch({ type: "open", tab: tabB }));
    await act(async () => probe().navigation.back());
    await act(async () => probe().navigation.back());
    expect(probe().navigation.route.kind).toBe("files");

    // Some outside path activates B while the route is Files: the observer
    // pushes it as a fresh bound entry, truncating the walked-back tail.
    await act(async () => probe().dispatch({ type: "activate", tabId: tabB.id }));

    const visit = currentVisit(probe().tabState.history);
    expect(visit?.tab.id).toBe(tabB.id);
    expect(probe().navigation.route).toEqual({ kind: "tab", tabId: tabB.id, visitId: visit?.id });
    expect(historyDepth()).toBe(1);
    expect(probe().navigation.canGoForward).toBe(false);
  });

  it("replaces a bound route with Files when the last tab closes", async () => {
    const probe = await renderSync();
    const tabA = noteTab("a.md");
    await act(async () => probe().dispatch({ type: "open", tab: tabA }));
    const visitA = currentVisit(probe().tabState.history);
    expect(probe().navigation.route).toEqual({
      kind: "tab",
      tabId: tabA.id,
      visitId: visitA?.id
    });

    // Closing the only tab leaves no visit at all — not even a survivor to
    // re-point the route at. The dead slot is rewritten to Files in place.
    await act(async () => probe().dispatch({ type: "requestClose", tabId: tabA.id }));

    expect(probe().tabState.tabs).toHaveLength(0);
    expect(probe().navigation.route).toEqual({ kind: "files" });
    // Nothing bound survives in the ledger: Forward cannot reopen A.
    expect(probe().navigation.canGoForward).toBe(false);
    await act(async () => probe().navigation.forward());
    expect(probe().navigation.route).toEqual({ kind: "files" });
  });

  it("a tab route buried by a same-batch inspector restores through the ledger", async () => {
    const probe = await renderSync();
    const tabIdA = editorTabId({ rootPath: "/vault", relativePath: "a.md" });

    // Opener + inspector in one batch: the tab pushes bare (the visit id does
    // not exist yet), then the inspector takes the top slot — the entry
    // underneath is never physically rewritten, so only the ledger can carry
    // its binding.
    await act(async () => {
      probe().dispatch({ type: "open", tab: noteTab("a.md") });
      probe().navigation.push({ kind: "tab", tabId: tabIdA });
      probe().navigation.pushOverlay({ kind: "inspector", panel: "outline", parent: "content" });
    });
    const visitA = currentVisit(probe().tabState.history);
    expect(visitA).not.toBeNull();

    // Peeling the inspector adopts the bare entry, resolved to the visit
    // through the ledger rather than reading as an unbound route.
    await act(async () => probe().navigation.dismissOverlay());
    expect(probe().navigation.route).toEqual({ kind: "tab", tabId: tabIdA, visitId: visitA?.id });

    // B takes over A's strip slot; A's visit is retained by the log.
    await act(async () =>
      probe().dispatch({ type: "open", tab: noteTab("b.md"), placement: "replace-active" })
    );
    expect(probe().tabState.tabs).toHaveLength(1);
    const visitB = currentVisit(probe().tabState.history);
    expect(visitB?.id).not.toBe(visitA?.id);

    // Back reopens A through its retained visit id — not a re-push of B and
    // never a stranded bare route.
    await act(async () => probe().navigation.back());
    expect(probe().navigation.route).toEqual({ kind: "tab", tabId: tabIdA, visitId: visitA?.id });
    expect(currentVisit(probe().tabState.history)?.id).toBe(visitA?.id);
    expect(probe().tabState.activeTabId).toBe(tabIdA);
    expect(probe().tabState.tabs).toHaveLength(1);

    // Back to Files keeps A's tab in the strip; closing it there scrubs vA,
    // leaving a dead slot *between* live entries (Files and B's visit).
    await act(async () => probe().navigation.back());
    expect(probe().navigation.route).toEqual({ kind: "files" });
    await act(async () => probe().dispatch({ type: "requestClose", tabId: tabIdA }));
    expect(findVisit(probe().tabState.history, visitA!.id)).toBeNull();

    // Forward steps over the dead A entry to B's live visit; Back steps over
    // it again to the root.
    await act(async () => probe().navigation.forward());
    expect(probe().navigation.route).toMatchObject({ visitId: visitB?.id });
    expect(currentVisit(probe().tabState.history)?.id).toBe(visitB?.id);

    await act(async () => probe().navigation.back());
    expect(probe().navigation.route).toEqual({ kind: "files" });
  });
});
