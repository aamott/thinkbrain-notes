// @vitest-environment happy-dom

import { ChangeSet, EditorState, type ChangeDesc } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { act, useEffect, useReducer, useRef, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { resetNotificationStore, useNotificationStore } from "../notifications/notificationStore";
import {
  notifyEditorMapped,
  notifyEditorVisibility,
  registerEditorView,
  unregisterEditorView
} from "../tabs/editorLocationRegistry";
import {
  createEditorTab,
  desktopTabReducer,
  editorTabId,
  initialDesktopTabState,
  type DesktopTabAction,
  type DesktopTabState
} from "../tabs/tabModel";
import {
  useHistoryDispatch,
  useLocationHistory,
  type LocationHistoryApi
} from "./useLocationHistory";

const noteA = createEditorTab({ rootPath: "/notes", relativePath: "a.md" });
const noteB = createEditorTab({ rootPath: "/notes", relativePath: "b.md" });

interface ProbeHandle {
  readonly state: DesktopTabState;
  readonly dispatch: (action: DesktopTabAction) => void;
  /** The raw reducer dispatch — bookkeeping that never bumps the request seq. */
  readonly rawDispatch: (action: DesktopTabAction) => void;
  readonly api: LocationHistoryApi;
  readonly loadDocumentIntoView: ReturnType<typeof vi.fn>;
}

/**
 * Stands in for an editor's value-sync effect: a parked state whose doc is
 * behind the latest value pushes the difference through the registry during
 * the passive-effect phase of the commit that lands it. Being a child of
 * Probe, its effect runs before the hook's own — the same ordering the real
 * editor has against the shell.
 */
function StaleDocSync({
  fire,
  tabId,
  changes
}: {
  readonly fire: boolean;
  readonly tabId: string;
  readonly changes: ChangeDesc;
}) {
  useEffect(() => {
    if (fire) notifyEditorMapped(tabId, changes);
  }, [fire, tabId, changes]);
  return null;
}

/**
 * Renders the hook against the real tab reducer and the departure-enriched
 * dispatch — the same wiring `useShellState` installs — so these tests cover
 * capture, recording and restore together rather than each in isolation.
 */
function Probe({
  sinkRef,
  sync,
  guard
}: {
  readonly sinkRef: { current?: ProbeHandle };
  readonly sync?: {
    readonly when: (state: DesktopTabState) => boolean;
    readonly tabId: string;
    readonly changes: ChangeDesc;
  };
  readonly guard?: () => Promise<boolean>;
}) {
  const [tabState, dispatchTabs] = useReducer(desktopTabReducer, initialDesktopTabState);
  const stateRef = useRef(tabState);
  useEffect(() => {
    stateRef.current = tabState;
  });
  const guardRef = useRef<(() => Promise<boolean>) | null>(guard ?? null);
  const seqRef = useRef(0);
  const dispatch = useHistoryDispatch(dispatchTabs, stateRef, guardRef, seqRef);
  const [loadDocumentIntoView] = useState(() => vi.fn());
  const api = useLocationHistory({
    tabState,
    dispatchTabs,
    dispatchNavigation: dispatch,
    documents: {},
    loadDocumentIntoView
  });
  useEffect(() => {
    sinkRef.current = { state: tabState, dispatch, rawDispatch: dispatchTabs, api, loadDocumentIntoView };
  });
  return sync ? (
    <StaleDocSync fire={sync.when(tabState)} tabId={sync.tabId} changes={sync.changes} />
  ) : null;
}

let root: Root | null = null;
let container: HTMLDivElement | null = null;
const views: { key: string; view: EditorView }[] = [];

const mountProbe = async (
  sync?: Parameters<typeof Probe>[0]["sync"],
  guard?: () => Promise<boolean>
): Promise<{ current?: ProbeHandle }> => {
  const sinkRef: { current?: ProbeHandle } = {};
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root!.render(<Probe sinkRef={sinkRef} sync={sync} guard={guard} />));
  return sinkRef;
};

/** A `DOMRect`-shaped stand-in — happy-dom lays nothing out on its own. */
const rect = (top: number, bottom: number): DOMRect =>
  ({ top, bottom, left: 0, right: 800, x: 0, y: top, width: 800, height: bottom - top }) as DOMRect;

/**
 * Gives `view` a settled landing geometry: the jump target measured where a
 * landed jump leaves it — `topAt` inside the scroller — and the scroller
 * either parked at its bottom or not. Without this, `isEditorAtLine` sees
 * happy-dom's empty layout and conservatively answers "not there".
 */
const fakeLanding = (
  view: EditorView,
  topAt: number,
  metrics: { scrollTop: number; clientHeight: number; scrollHeight: number }
): void => {
  vi.spyOn(view, "coordsAtPos").mockReturnValue({ left: 0, right: 8, top: topAt, bottom: topAt + 18 });
  vi.spyOn(view.scrollDOM, "getBoundingClientRect").mockReturnValue(rect(0, metrics.clientHeight));
  Object.defineProperties(view.scrollDOM, {
    // CM's measure pass writes scrollTop — let it; the test owns the read.
    scrollTop: { configurable: true, get: () => metrics.scrollTop, set: () => undefined },
    clientHeight: { configurable: true, get: () => metrics.clientHeight },
    scrollHeight: { configurable: true, get: () => metrics.scrollHeight }
  });
};

const mountEditor = (tabId: string, doc: string): EditorView => {
  const host = document.createElement("div");
  document.body.append(host);
  const view = new EditorView({ parent: host, state: EditorState.create({ doc }) });
  // happy-dom dispatches selectionchange synchronously where a real browser
  // defers it, so a live focus() re-enters the view mid-update. Stubbing it
  // keeps the restore assertions; focus itself is covered by the registry's
  // own tests.
  vi.spyOn(view, "focus").mockImplementation(() => undefined);
  views.push({ key: tabId, view });
  registerEditorView(tabId, view);
  return view;
};

afterEach(async () => {
  // Unregistering announces a view-set change — a React state update — so it
  // goes inside act like every other registry mutation in these tests.
  await act(async () => {
    for (const { key, view } of views.splice(0)) {
      unregisterEditorView(key, view);
      view.destroy();
    }
  });
  await act(async () => root?.unmount());
  root = null;
  container?.remove();
  container = null;
  document.body.replaceChildren();
  resetNotificationStore();
});

describe("useLocationHistory", () => {
  it("navigateToLine records an in-file visit and lands the cursor at the line", async () => {
    const sinkRef = await mountProbe();
    let view!: EditorView;
    await act(async () => {
      view = mountEditor(noteA.id, "alpha\nbeta\ngamma");
    });

    await act(async () => sinkRef.current!.dispatch({ type: "open", tab: noteA }));
    await act(async () => sinkRef.current!.api.navigateToLine(2));

    const history = sinkRef.current!.state.history;
    expect(history.entries).toHaveLength(2);
    expect(history.entries[1]!.location).toMatchObject({ anchor: 6, head: 6, scrollPos: 6 });
    expect(view.state.selection.main.anchor).toBe(6);
  });

  it("snapshots the departing position so Back restores where the user left", async () => {
    const sinkRef = await mountProbe();
    let view!: EditorView;
    await act(async () => {
      view = mountEditor(noteA.id, "alpha\nbeta\ngamma");
    });

    await act(async () => sinkRef.current!.dispatch({ type: "open", tab: noteA }));
    await act(async () => view.dispatch({ selection: { anchor: 8, head: 10 } }));
    await act(async () => sinkRef.current!.api.navigateToLine(1));
    expect(view.state.selection.main.anchor).toBe(0);

    // The departure capture filed the selection under the first visit;
    // stepping Back re-applies it through the pending restore.
    await act(async () => sinkRef.current!.dispatch({ type: "goBack" }));
    expect(sinkRef.current!.state.history.cursor).toBe(0);
    expect(view.state.selection.main.anchor).toBe(8);
    expect(view.state.selection.main.head).toBe(10);
  });

  it("captureCurrentLocation files the live position under the current visit", async () => {
    const sinkRef = await mountProbe();
    let view!: EditorView;
    await act(async () => {
      view = mountEditor(noteA.id, "alpha\nbeta\ngamma");
    });

    await act(async () => sinkRef.current!.dispatch({ type: "open", tab: noteA }));
    await act(async () => view.dispatch({ selection: { anchor: 2 } }));

    let location: ReturnType<LocationHistoryApi["captureCurrentLocation"]> = null;
    await act(async () => {
      location = sinkRef.current!.api.captureCurrentLocation();
    });

    expect(location).toMatchObject({ anchor: 2, head: 2 });
    expect(sinkRef.current!.state.history.entries[0]!.location).toMatchObject({ anchor: 2, head: 2 });
    expect(sinkRef.current!.state.history.entries).toHaveLength(1);
  });

  it("goToVisit reopens a displaced preview and loads its missing document", async () => {
    const sinkRef = await mountProbe();

    // A preview takes over the preview that came before it: opening B
    // displaces A's tab but retains its visit.
    await act(async () => {
      sinkRef.current!.dispatch({ type: "open", tab: noteA, placement: "preview" });
      sinkRef.current!.dispatch({ type: "open", tab: noteB, placement: "preview" });
    });
    expect(sinkRef.current!.state.tabs.map((tab) => tab.id)).toEqual([noteB.id]);

    const visitA = sinkRef.current!.state.history.entries[0]!;
    await act(async () => sinkRef.current!.api.goToVisit(visitA.id));

    const state = sinkRef.current!.state;
    expect(state.activeTabId).toBe(noteA.id);
    expect(state.tabs.map((tab) => tab.id)).toEqual([noteA.id]);
    expect(state.history.cursor).toBe(0);
    // The displaced tab's view state is gone, so the shell re-reads the file.
    expect(sinkRef.current!.loadDocumentIntoView).toHaveBeenCalledWith(
      noteA.id,
      "/notes",
      "a.md",
      "editor"
    );
  });

  it("a repeated jump to the landed line records nothing — count and Forward tail hold", async () => {
    const sinkRef = await mountProbe();
    let view!: EditorView;
    await act(async () => {
      view = mountEditor(noteA.id, "alpha\nbeta\ngamma");
      // The landed-jump geometry: target at the scroller's top edge.
      fakeLanding(view, 5, { scrollTop: 0, clientHeight: 600, scrollHeight: 1000 });
    });

    // Each act is one commit, matching how real events each see fresh state.
    await act(async () => sinkRef.current!.dispatch({ type: "open", tab: noteA }));
    await act(async () => {
      sinkRef.current!.api.navigateToLine(2);
      // Rewrite the visit's location in scrollSnapshot form — the shape a
      // live departure capture stores. A `scrollPos` jump can never equal it
      // inside `recordVisit`, so only the pre-dispatch guard keeps a repeat
      // click from stacking a duplicate visit.
      sinkRef.current!.api.captureCurrentLocation();
      sinkRef.current!.api.navigateToLine(2);
    });
    expect(sinkRef.current!.state.history.entries).toHaveLength(2);

    // Back restores the in-file visit (caret + viewport landed), so jumping
    // to that same line while B waits Forward is a no-op too.
    await act(async () =>
      sinkRef.current!.dispatch({ type: "open", tab: noteB, placement: "replace-active" })
    );
    await act(async () => {
      sinkRef.current!.dispatch({ type: "goBack" });
      sinkRef.current!.api.navigateToLine(2);
    });

    const history = sinkRef.current!.state.history;
    expect(history.entries.map((entry) => entry.tab.id)).toEqual([
      noteA.id,
      noteA.id,
      noteB.id
    ]);
    expect(history.cursor).toBe(1);
    expect(view.state.selection.main.head).toBe(6);
  });

  it("dedupes a repeated jump to a tail line the scroller clamps at the bottom", async () => {
    const sinkRef = await mountProbe();
    let view!: EditorView;
    await act(async () => {
      view = mountEditor(noteA.id, "alpha\nbeta\ngamma");
    });

    // The document's last line can never top the viewport — the scroller
    // clamps at the bottom — yet a repeat click on it is still one visit.
    await act(async () => {
      // The bottom-clamped landing shape: scroller at its bottom, target
      // fully inside the viewport but nowhere near its top.
      fakeLanding(view, 500, { scrollTop: 400, clientHeight: 600, scrollHeight: 1000 });
      sinkRef.current!.dispatch({ type: "open", tab: noteA });
    });
    await act(async () => {
      sinkRef.current!.api.navigateToLine(3);
      sinkRef.current!.api.captureCurrentLocation();
      sinkRef.current!.api.navigateToLine(3);
    });

    expect(sinkRef.current!.state.history.entries).toHaveLength(2);
    expect(view.state.selection.main.head).toBe(11);
  });

  it("holds a pending restore until the destination editor mounts, then focuses it", async () => {
    const sinkRef = await mountProbe();
    let view!: EditorView;
    await act(async () => {
      view = mountEditor(noteA.id, "alpha\nbeta\ngamma");
    });

    // Park the departing position on the first visit, jump to line 1, then
    // take the view out of the registry before Back.
    await act(async () => sinkRef.current!.dispatch({ type: "open", tab: noteA }));
    await act(async () => {
      view.dispatch({ selection: { anchor: 8 } });
      sinkRef.current!.api.navigateToLine(1);
      unregisterEditorView(noteA.id, view);
    });
    await act(async () => sinkRef.current!.dispatch({ type: "goBack" }));

    // No live view: the restore stays queued rather than dying — and has not
    // disturbed the editor's current selection.
    expect(view.state.selection.main.anchor).toBe(0);

    // The view registering later is what lets the queued restore land.
    await act(async () => registerEditorView(noteA.id, view));
    expect(view.state.selection.main.anchor).toBe(8);
    expect(view.focus).toHaveBeenCalled();
  });

  it("a no-op navigation keeps the Forward tail", async () => {
    const sinkRef = await mountProbe();

    await act(async () => {
      sinkRef.current!.dispatch({ type: "open", tab: noteA });
      sinkRef.current!.dispatch({ type: "open", tab: noteB, placement: "replace-active" });
      sinkRef.current!.dispatch({ type: "goBack" });
      // Re-opening the view already on screen records nothing — Forward
      // to B must survive.
      sinkRef.current!.dispatch({ type: "open", tab: noteA });
      sinkRef.current!.dispatch({ type: "goForward" });
    });

    const history = sinkRef.current!.state.history;
    expect(history.entries.map((entry) => entry.tab.id)).toEqual([noteA.id, noteB.id]);
    expect(history.cursor).toBe(1);
    expect(sinkRef.current!.state.activeTabId).toBe(noteB.id);
  });

  it("resolves the visit's tab id at apply time when a rename lands before the editor mounts", async () => {
    const sinkRef = await mountProbe();
    let view!: EditorView;
    await act(async () => {
      view = mountEditor(noteA.id, "alpha\nbeta\ngamma");
    });

    // Park the departing position on the first visit, jump to line 1, then
    // take the view out of the registry — the Back restore stays queued.
    await act(async () => sinkRef.current!.dispatch({ type: "open", tab: noteA }));
    await act(async () => {
      view.dispatch({ selection: { anchor: 8 } });
      sinkRef.current!.api.navigateToLine(1);
      unregisterEditorView(noteA.id, view);
    });
    await act(async () => sinkRef.current!.dispatch({ type: "goBack" }));
    expect(view.state.selection.main.anchor).toBe(0);

    // The file is renamed while the restore waits: the visit's descriptor —
    // and the active tab — move to the new id.
    const to = { rootPath: "/notes", relativePath: "a-renamed.md" };
    await act(async () =>
      sinkRef.current!.dispatch({
        type: "retarget",
        from: { rootPath: "/notes", relativePath: "a.md" },
        to
      })
    );
    const movedId = editorTabId(to);
    expect(sinkRef.current!.state.activeTabId).toBe(movedId);

    // The editor registers under the new id — the queued restore must
    // follow the visit's descriptor, not the id it was armed with.
    await act(async () => {
      registerEditorView(movedId, view);
      views.push({ key: movedId, view });
    });
    expect(view.state.selection.main.anchor).toBe(8);
    expect(view.focus).toHaveBeenCalled();
  });

  it("applies the mapped position when a doc change lands in the restore's own commit", async () => {
    // The parked editor's value-sync reports its doc change in the commit
    // the cursor lands — the epoch fence holds the queued restore until the
    // mapped position arrives rather than applying the pre-mapping anchor.
    const sinkRef = await mountProbe({
      // Fires exactly when Back lands the cursor on the first visit.
      when: (state) => state.history.cursor === 0 && state.history.entries.length === 2,
      tabId: noteA.id,
      changes: ChangeSet.of({ from: 0, insert: "XXXX" }, 16)
    });
    let view!: EditorView;
    await act(async () => {
      view = mountEditor(noteA.id, "alpha\nbeta\ngamma");
    });

    await act(async () => sinkRef.current!.dispatch({ type: "open", tab: noteA }));
    await act(async () => {
      view.dispatch({ selection: { anchor: 10 } });
      sinkRef.current!.api.navigateToLine(1); // visit 1 stores anchor 10
    });
    await act(async () => sinkRef.current!.dispatch({ type: "goBack" }));

    // The insertion at the top maps the stored anchor four characters
    // later; the unfenced restore would have applied the stale 10.
    expect(view.state.selection.main.anchor).toBe(14);
  });

  it("keeps the stored departure while hidden and restores it when the surface re-shows", async () => {
    const sinkRef = await mountProbe();
    let view!: EditorView;
    await act(async () => {
      view = mountEditor(noteA.id, "alpha\nbeta\ngamma");
    });
    await act(async () => sinkRef.current!.dispatch({ type: "open", tab: noteA }));
    await act(async () => {
      view.dispatch({ selection: { anchor: 8 } });
      sinkRef.current!.api.navigateToLine(1);
    });
    // The jump focused the editor (its direct restore plus the queued one).
    const focusCalls = (): number => vi.mocked(view.focus).mock.calls.length;
    const focusWhenCovered = focusCalls();

    // The phone covering the tab surface: the editor stays mounted and
    // registered under an ancestor marked hidden — where its scroller reads
    // a zeroed viewport.
    const surface = document.createElement("div");
    await act(async () => {
      surface.append(view.dom.parentElement!);
      document.body.append(surface);
      surface.setAttribute("aria-hidden", "true");
    });

    // Capturing while covered must return nothing — the departure the jump
    // already stored survives rather than being overwritten by the zeroed
    // hidden snapshot.
    let captured: ReturnType<LocationHistoryApi["captureCurrentLocation"]> = null;
    await act(async () => {
      captured = sinkRef.current!.api.captureCurrentLocation();
    });
    expect(captured).toBeNull();

    // Back while covered moves the cursor but cannot land the restore: no
    // caret move, no focus grab through the cover, and visit 2's stored
    // departure is untouched by the refused capture.
    await act(async () => sinkRef.current!.dispatch({ type: "goBack" }));
    expect(view.state.selection.main.anchor).toBe(0);
    expect(focusCalls()).toBe(focusWhenCovered);
    expect(sinkRef.current!.state.history.entries[1]!.location).toMatchObject({
      anchor: 0,
      head: 0,
      scrollPos: 0
    });

    // Re-shown — TabContent's visibility announcement re-arms and retries,
    // landing the visit's stored position and focus now that the editor is
    // visible again.
    await act(async () => {
      surface.removeAttribute("aria-hidden");
      notifyEditorVisibility(noteA.id);
    });
    expect(view.state.selection.main.anchor).toBe(8);
    expect(focusCalls()).toBe(focusWhenCovered + 1);
  });
});

describe("navigateToHeading", () => {
  it("jumps to the heading's line as one in-file visit — Back/Forward are exact", async () => {
    const sinkRef = await mountProbe();
    let view!: EditorView;
    await act(async () => {
      view = mountEditor(noteA.id, "# Top\nalpha\nbeta\n## Deep Section\ntail");
    });
    await act(async () => sinkRef.current!.dispatch({ type: "open", tab: noteA }));
    await act(async () => view.dispatch({ selection: { anchor: 7 } }));

    await act(async () => sinkRef.current!.api.navigateToHeading("deep-section"));

    const history = sinkRef.current!.state.history;
    expect(history.entries).toHaveLength(2);
    const line4 = view.state.doc.line(4).from;
    expect(view.state.selection.main.anchor).toBe(line4);
    expect(history.entries[1]!.location).toMatchObject({ anchor: line4 });

    // Back restores the parked caret; Forward lands on the heading again.
    await act(async () => sinkRef.current!.dispatch({ type: "goBack" }));
    expect(view.state.selection.main.anchor).toBe(7);
    await act(async () => sinkRef.current!.dispatch({ type: "goForward" }));
    expect(view.state.selection.main.anchor).toBe(line4);
  });

  it("sees a heading typed into the live document before any save", async () => {
    const sinkRef = await mountProbe();
    let view!: EditorView;
    await act(async () => {
      view = mountEditor(noteA.id, "# Top\nbody");
    });
    await act(async () => sinkRef.current!.dispatch({ type: "open", tab: noteA }));
    // The documents map is stale — only the editor view carries the heading.
    await act(async () =>
      view.dispatch({ changes: { from: view.state.doc.length, insert: "\n## Unsaved" } })
    );

    await act(async () => sinkRef.current!.api.navigateToHeading("unsaved"));
    expect(view.state.selection.main.anchor).toBe(view.state.doc.line(3).from);
    expect(sinkRef.current!.state.history.entries).toHaveLength(2);
  });

  it("a missing heading warns and records nothing — no jump, no load", async () => {
    const sinkRef = await mountProbe();
    const view = mountEditor(noteA.id, "# Only\nbody");
    await act(async () => registerEditorView(noteA.id, view));
    await act(async () => sinkRef.current!.dispatch({ type: "open", tab: noteA }));
    const anchor = view.state.selection.main.anchor;
    const loads = sinkRef.current!.loadDocumentIntoView.mock.calls.length;

    await act(async () => sinkRef.current!.api.navigateToHeading("nope"));

    expect(sinkRef.current!.state.history.entries).toHaveLength(1);
    expect(view.state.selection.main.anchor).toBe(anchor);
    // The miss never touches the loader — the open's own load stands alone.
    expect(sinkRef.current!.loadDocumentIntoView.mock.calls.length).toBe(loads);
    const warning = useNotificationStore.getState().notifications.at(-1);
    expect(warning).toMatchObject({
      source: "navigation",
      title: "Heading not found",
      variant: "warning"
    });
  });

  it("is a no-op on a non-editor tab or without a live view", async () => {
    const sinkRef = await mountProbe();
    // No registered editor: resolution cannot run — silently inert.
    await act(async () => sinkRef.current!.dispatch({ type: "open", tab: noteA }));
    await act(async () => sinkRef.current!.api.navigateToHeading("anything"));
    expect(sinkRef.current!.state.history.entries).toHaveLength(1);
    expect(useNotificationStore.getState().notifications).toHaveLength(0);
  });
});

describe("the deferred traversal guard", () => {
  const noteC = createEditorTab({ rootPath: "/notes", relativePath: "c.md" });

  it("traverses once the save resolves — its own bookkeeping is not a move", async () => {
    let release: ((ok: boolean) => void) | null = null;
    const guard = () =>
      new Promise<boolean>((resolve) => {
        release = resolve;
      });
    const sinkRef = await mountProbe(undefined, guard);

    await act(async () => {
      sinkRef.current!.dispatch({ type: "open", tab: noteA });
      sinkRef.current!.dispatch({ type: "open", tab: noteB, placement: "replace-active" });
      sinkRef.current!.rawDispatch({ type: "setDirty", tabId: noteB.id, isDirty: true });
    });
    const seqBefore = sinkRef.current!.state;
    await act(async () => sinkRef.current!.dispatch({ type: "goBack" }));
    // Guard still pending: nothing moved.
    expect(sinkRef.current!.state.activeTabId).toBe(noteB.id);

    // The save's own setDirty(false) commit lands mid-await — a new state
    // object, but the same departure. The hop must still complete.
    await act(async () => {
      sinkRef.current!.rawDispatch({ type: "setDirty", tabId: noteB.id, isDirty: false });
      release?.(true);
    });

    const state = sinkRef.current!.state;
    expect(state).not.toBe(seqBefore);
    expect(state.activeTabId).toBe(noteA.id);
    expect(state.history.cursor).toBe(0);
  });

  it("abandons the hop when a newer navigation intervened", async () => {
    let release: ((ok: boolean) => void) | null = null;
    const guard = () =>
      new Promise<boolean>((resolve) => {
        release = resolve;
      });
    const sinkRef = await mountProbe(undefined, guard);

    await act(async () => {
      sinkRef.current!.dispatch({ type: "open", tab: noteA });
      sinkRef.current!.dispatch({ type: "open", tab: noteC });
      sinkRef.current!.dispatch({ type: "activate", tabId: noteA.id });
      sinkRef.current!.dispatch({ type: "open", tab: noteB, placement: "replace-active" });
      sinkRef.current!.rawDispatch({ type: "setDirty", tabId: noteB.id, isDirty: true });
    });
    await act(async () => sinkRef.current!.dispatch({ type: "goBack" }));

    // A deliberate tab switch while the save runs: the stale hop must not
    // come back and displace C when the guard finally answers.
    await act(async () => {
      sinkRef.current!.dispatch({ type: "activate", tabId: noteC.id });
      release?.(true);
    });

    const state = sinkRef.current!.state;
    expect(state.activeTabId).toBe(noteC.id);
    expect(state.tabs.map((tab) => tab.id)).toEqual([noteB.id, noteC.id]);
  });
});
