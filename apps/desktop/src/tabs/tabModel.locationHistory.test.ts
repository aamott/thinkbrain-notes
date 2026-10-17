import { ChangeSet } from "@codemirror/state";
import { describe, expect, it } from "vitest";

import {
  canGoBackInTabs,
  canGoForwardInTabs,
  createEditorTab,
  desktopTabReducer,
  initialDesktopTabState
} from "./tabModel";

function reduce(...actions: Parameters<typeof desktopTabReducer>[1][]) {
  return actions.reduce(desktopTabReducer, initialDesktopTabState);
}

describe("location visits", () => {
  const noteA = createEditorTab({ rootPath: "/notes", relativePath: "a.md" });
  const noteB = createEditorTab({ rootPath: "/notes", relativePath: "b.md" });
  const at = (anchor: number, head = anchor) => ({ anchor, head });

  it("navigateToLocation appends an in-file visit and keeps the tab descriptor", () => {
    const opened = reduce({ type: "open", tab: noteA });
    const state = desktopTabReducer(opened, {
      type: "navigateToLocation",
      location: { anchor: 42, head: 42, scrollPos: 42 }
    });

    expect(state.history.entries).toHaveLength(2);
    expect(state.history.entries[1]).toMatchObject({
      tab: { id: noteA.id },
      location: { anchor: 42, head: 42, scrollPos: 42 }
    });
    expect(state.history.cursor).toBe(1);
    expect(state.history.entries[0]!.id).not.toBe(state.history.entries[1]!.id);
  });

  it("a duplicate in-file jump records nothing", () => {
    const opened = reduce({ type: "open", tab: noteA });
    const jumped = desktopTabReducer(opened, { type: "navigateToLocation", location: at(42) });

    expect(desktopTabReducer(jumped, { type: "navigateToLocation", location: at(42) })).toBe(jumped);
  });

  it("setVisitLocation updates the departed visit in place — no new entry", () => {
    const opened = reduce(
      { type: "open", tab: noteA },
      { type: "open", tab: noteB, placement: "replace-active" },
      { type: "goBack" }
    );
    const visitId = opened.history.entries[0]!.id;
    const state = desktopTabReducer(opened, {
      type: "setVisitLocation",
      visitId,
      location: at(17)
    });

    expect(state.history.entries).toHaveLength(2);
    expect(state.history.entries[0]!.location).toEqual(at(17));
    expect(state.history.cursor).toBe(0);
  });

  it("mapLocations re-anchors stored positions through a document change", () => {
    const opened = reduce({ type: "open", tab: noteA }, { type: "open", tab: noteB });
    const visitId = opened.history.entries[0]!.id;
    const withPos = desktopTabReducer(opened, {
      type: "setVisitLocation",
      visitId,
      location: at(10)
    });
    const state = desktopTabReducer(withPos, {
      type: "mapLocations",
      tabId: noteA.id,
      changes: ChangeSet.of({ from: 0, insert: "XXXX" }, 20)
    });

    expect(state.history.entries[0]!.location).toMatchObject({ anchor: 14, head: 14 });
    // No visit was created or re-ordered — positions track text, not history.
    expect(state.history.entries.map((entry) => entry.id)).toEqual(
      withPos.history.entries.map((entry) => entry.id)
    );
  });

  it("restoreVisit lands on a same-trail visit by id without recording", () => {
    const opened = reduce(
      { type: "open", tab: noteA },
      { type: "open", tab: noteB, placement: "replace-active" }
    );
    const visitId = opened.history.entries[0]!.id;
    const state = desktopTabReducer(opened, { type: "restoreVisit", visitId });

    expect(state.activeTabId).toBe(noteA.id);
    expect(state.history.cursor).toBe(0);
    expect(state.history.entries).toHaveLength(2);
    // Unknown ids are a no-op.
    expect(desktopTabReducer(opened, { type: "restoreVisit", visitId: 999 })).toBe(opened);
  });

  it("restoreVisit refuses a visit belonging to another trail", () => {
    const opened = reduce({ type: "open", tab: noteA }, { type: "open", tab: noteB });

    // A's visit belongs to A's trail — the active B trail is not a destination.
    expect(desktopTabReducer(opened, {
      type: "restoreVisit",
      visitId: opened.history.entries[0]!.id
    })).toBe(opened);
  });

  it("a rename rewrites a displaced visit's descriptor, location intact", () => {
    const opened = reduce(
      { type: "open", tab: noteA, placement: "preview" },
      // The position belongs to A's visit before B takes the preview over.
      { type: "navigateToLocation", location: at(7) },
      { type: "open", tab: noteB, placement: "preview" },
      {
        type: "retarget",
        from: { rootPath: "/notes", relativePath: "a.md" },
        to: { rootPath: "/notes", relativePath: "renamed-a.md" }
      }
    );
    const moved = createEditorTab({ rootPath: "/notes", relativePath: "renamed-a.md" });

    // Both of A's displaced visits now name the new path — and the in-file
    // position survived, since a rename moves no text.
    expect(opened.history.entries[0]!.tab.id).toBe(moved.id);
    expect(opened.history.entries[1]!.tab.id).toBe(moved.id);
    expect(opened.history.entries[1]!.location).toEqual(at(7));
    const back = desktopTabReducer(opened, { type: "goBack" });
    expect(back.activeTabId).toBe(moved.id);
  });

  it("historyDestination describes a displaced tab nothing shows", () => {
    const opened = reduce(
      { type: "open", tab: noteA, placement: "preview" },
      { type: "open", tab: noteB, placement: "preview" }
    );

    expect(opened.tabs.some((tab) => tab.id === noteA.id)).toBe(false);
    expect(opened.history.entries[0]!.tab.id).toBe(noteA.id);
    expect(canGoBackInTabs(opened)).toBe(true);
  });
});

describe("logical trails", () => {
  const noteA = createEditorTab({ rootPath: "/notes", relativePath: "a.md" });
  const noteB = createEditorTab({ rootPath: "/notes", relativePath: "b.md" });
  const noteB2 = createEditorTab({ rootPath: "/notes", relativePath: "b2.md" });
  const noteC = createEditorTab({ rootPath: "/notes", relativePath: "c.md" });
  const noteD = createEditorTab({ rootPath: "/notes", relativePath: "d.md" });

  it("starts with nowhere to go; opening another physical tab starts a fresh trail", () => {
    expect(canGoBackInTabs(initialDesktopTabState)).toBe(false);
    expect(canGoForwardInTabs(initialDesktopTabState)).toBe(false);

    const state = reduce({ type: "open", tab: noteA }, { type: "open", tab: noteB });

    expect(state.history.entries.map((entry) => entry.tab.id)).toEqual([noteA.id, noteB.id]);
    expect(state.history.cursor).toBe(1);
    // B's trail has only its own visit: switching tabs is not navigation.
    expect(canGoBackInTabs(state)).toBe(false);
    expect(canGoForwardInTabs(state)).toBe(false);
  });

  it("switching tabs records nothing and restores each trail's selected visit", () => {
    const opened = reduce(
      { type: "open", tab: noteA },
      { type: "open", tab: noteB, placement: "replace-active" },
      { type: "open", tab: noteC }
    );
    expect(opened.history.entries).toHaveLength(3);

    // Selecting the A→B slot is a switch, not a visit: cursor moves to its
    // remembered B visit with no entry appended.
    const toAB = desktopTabReducer(opened, { type: "activate", tabId: noteB.id });
    expect(toAB.activeTabId).toBe(noteB.id);
    expect(toAB.history.cursor).toBe(1);
    expect(toAB.history.entries).toHaveLength(3);

    const back = desktopTabReducer(toAB, { type: "goBack" });
    expect(back.activeTabId).toBe(noteA.id);
    expect(canGoForwardInTabs(back)).toBe(true);

    // C keeps its own (empty) Back — never another trail's visit.
    const toC = desktopTabReducer(back, { type: "activate", tabId: noteC.id });
    expect(toC.activeTabId).toBe(noteC.id);
    expect(canGoBackInTabs(toC)).toBe(false);
    expect(canGoForwardInTabs(toC)).toBe(false);

    // Returning to the first trail restores the cursor where it was left:
    // still on A's visit with B waiting Forward.
    const backToAB = desktopTabReducer(toC, { type: "activate", tabId: noteA.id });
    expect(backToAB.activeTabId).toBe(noteA.id);
    expect(canGoForwardInTabs(backToAB)).toBe(true);
    const forward = desktopTabReducer(backToAB, { type: "goForward" });
    expect(forward.activeTabId).toBe(noteB.id);
  });

  it("walks Back over a trail's visits and Forward back up again", () => {
    const opened = reduce(
      { type: "open", tab: noteA },
      { type: "open", tab: noteB, placement: "replace-active" },
      { type: "open", tab: noteC, placement: "replace-active" }
    );

    const back1 = desktopTabReducer(opened, { type: "goBack" });
    expect(back1.activeTabId).toBe(noteB.id);
    expect(canGoForwardInTabs(back1)).toBe(true);

    const back2 = desktopTabReducer(back1, { type: "goBack" });
    expect(back2.activeTabId).toBe(noteA.id);
    expect(canGoBackInTabs(back2)).toBe(false);
    // At the bottom of the trail Back is a no-op — same object, no churn.
    expect(desktopTabReducer(back2, { type: "goBack" })).toBe(back2);

    const forward = desktopTabReducer(back2, { type: "goForward" });
    expect(forward.activeTabId).toBe(noteB.id);
    const forward2 = desktopTabReducer(forward, { type: "goForward" });
    expect(forward2.activeTabId).toBe(noteC.id);
    expect(canGoForwardInTabs(forward2)).toBe(false);
    expect(desktopTabReducer(forward2, { type: "goForward" })).toBe(forward2);
  });

  it("truncates only the active trail's forward tail, preserving other trails' visits", () => {
    const opened = reduce(
      { type: "open", tab: noteA },
      { type: "open", tab: noteB, placement: "replace-active" },
      { type: "open", tab: noteC },
      // The A→B slot shows B's view; activating it re-enters trail one.
      { type: "activate", tabId: noteB.id },
      { type: "goBack" },
      { type: "open", tab: noteD, placement: "replace-active" }
    );

    // B's forward visit in the A/B trail is gone; C's trail visit survives.
    expect(opened.history.entries.map((entry) => entry.tab.id)).toEqual([
      noteA.id,
      noteC.id,
      noteD.id
    ]);
    expect(opened.activeTabId).toBe(noteD.id);
    expect(canGoForwardInTabs(opened)).toBe(false);

    const back = desktopTabReducer(opened, { type: "goBack" });
    expect(back.activeTabId).toBe(noteA.id);
    // Back still never reaches into C's trail.
    expect(canGoBackInTabs(back)).toBe(false);
  });

  it("re-raising an already-open tab switches trails without recording", () => {
    const state = reduce(
      { type: "open", tab: noteA },
      { type: "open", tab: noteB },
      { type: "open", tab: noteA }
    );

    expect(state.activeTabId).toBe(noteA.id);
    expect(state.history.entries.map((entry) => entry.tab.id)).toEqual([noteA.id, noteB.id]);
    expect(state.history.cursor).toBe(0);
  });

  it("a link to a file already open in another trail gets its own view", () => {
    // B lives in its own trail; the A trail's link to B must not activate or
    // remove it — a collision view id is minted instead.
    const state = reduce(
      { type: "open", tab: noteA },
      { type: "open", tab: noteB },
      { type: "activate", tabId: noteA.id },
      { type: "open", tab: noteB, placement: "replace-active" }
    );
    const viewId = `${noteB.id}:view:${state.history.nextVisitId - 1}`;

    expect(state.tabs.map((tab) => tab.id)).toEqual([viewId, noteB.id]);
    expect(state.activeTabId).toBe(viewId);
    // Back walks the trail's own visits: the slot restores A.
    const back = desktopTabReducer(state, { type: "goBack" });
    expect(back.activeTabId).toBe(noteA.id);
    // Forward returns to the B *view* — the other trail's B tab is untouched.
    const forward = desktopTabReducer(back, { type: "goForward" });
    expect(forward.activeTabId).toBe(viewId);
    expect(forward.tabs.map((tab) => tab.id)).toEqual([viewId, noteB.id]);
  });

  it("closing a tab drops its whole trail and selects the neighbour's remembered visit", () => {
    const opened = reduce(
      { type: "open", tab: noteA },
      { type: "open", tab: noteB, placement: "replace-active" },
      { type: "open", tab: noteC }
    );
    const closed = desktopTabReducer(opened, { type: "requestClose", tabId: noteC.id });

    // C's trail is gone entirely; the survivor keeps its own visits.
    expect(closed.history.entries.map((entry) => entry.tab.id)).toEqual([noteA.id, noteB.id]);
    expect(closed.activeTabId).toBe(noteB.id);
    expect(closed.history.cursor).toBe(1);

    const back = desktopTabReducer(closed, { type: "goBack" });
    expect(back.activeTabId).toBe(noteA.id);
    expect(canGoBackInTabs(back)).toBe(false);
    // Forward must never resurrect the closed trail.
    const forward = desktopTabReducer(back, { type: "goForward" });
    expect(forward.activeTabId).toBe(noteB.id);
    expect(canGoForwardInTabs(forward)).toBe(false);
  });

  it("keeps the cursor on its visit when another trail's tab closes", () => {
    const opened = reduce(
      { type: "open", tab: noteA },
      { type: "open", tab: noteB },
      { type: "open", tab: noteB2, placement: "replace-active" },
      { type: "open", tab: noteC },
      { type: "activate", tabId: noteB2.id },
      { type: "goBack" }
    );
    // Cursor sits on B's visit inside the B→B2 trail with B2 ahead Forward.
    expect(opened.activeTabId).toBe(noteB.id);
    expect(canGoForwardInTabs(opened)).toBe(true);

    const closed = desktopTabReducer(opened, { type: "requestClose", tabId: noteC.id });

    // Closing C removed only its own visit: the cursor stays on B's and the
    // trail's Forward tail still reaches B2.
    expect(closed.history.entries.map((entry) => entry.tab.id)).toEqual([
      noteA.id,
      noteB.id,
      noteB2.id
    ]);
    expect(closed.activeTabId).toBe(noteB.id);
    const forward = desktopTabReducer(closed, { type: "goForward" });
    expect(forward.activeTabId).toBe(noteB2.id);
    expect(canGoForwardInTabs(forward)).toBe(false);
  });

  it("follows a retargeted visit so Forward lands on the file's new name", () => {
    const opened = reduce(
      { type: "open", tab: noteA },
      { type: "open", tab: noteB, placement: "replace-active" },
      { type: "goBack" },
      {
        type: "retarget",
        from: { rootPath: "/notes", relativePath: "b.md" },
        to: { rootPath: "/notes", relativePath: "renamed.md" }
      }
    );
    const moved = createEditorTab({ rootPath: "/notes", relativePath: "renamed.md" });

    const forward = desktopTabReducer(opened, { type: "goForward" });
    expect(forward.activeTabId).toBe(moved.id);
  });

  it("rebases on resetHistory, keeping only the active tab", () => {
    const opened = reduce(
      { type: "open", tab: noteA },
      { type: "open", tab: noteB },
      { type: "resetHistory" }
    );

    expect(opened.history.entries.map((entry) => entry.tab.id)).toEqual([noteB.id]);
    expect(opened.history.cursor).toBe(0);
    expect(canGoBackInTabs(opened)).toBe(false);
    // Already reset: no churn, and an empty shell stays empty.
    expect(desktopTabReducer(opened, { type: "resetHistory" })).toBe(opened);
    expect(desktopTabReducer(initialDesktopTabState, { type: "resetHistory" }))
      .toBe(initialDesktopTabState);
  });
});

describe("restore placement", () => {
  const noteA = createEditorTab({ rootPath: "/notes", relativePath: "a.md" });
  const noteB = createEditorTab({ rootPath: "/notes", relativePath: "b.md" });

  it("Back keeps a permanent slot permanent instead of replaying its old preview flag", () => {
    const restored = reduce(
      { type: "open", tab: noteA, placement: "preview" },
      { type: "keep", tabId: noteA.id },
      { type: "open", tab: noteB, placement: "replace-active" },
      { type: "goBack" }
    );

    expect(restored.tabs).toHaveLength(1);
    expect(restored.activeTabId).toBe(noteA.id);
    expect(restored.tabs[0]?.preview).toBeUndefined();
  });

  it("a restore refills the slot in use for an absent destination", () => {
    const opened = reduce(
      { type: "open", tab: noteA },
      { type: "open", tab: noteB, placement: "replace-active" }
    );
    expect(opened.tabs.map((tab) => tab.id)).toEqual([noteB.id]);

    const restored = desktopTabReducer(opened, {
      type: "restoreVisit",
      visitId: opened.history.entries[0]!.id
    });

    expect(restored.tabs.map((tab) => tab.id)).toEqual([noteA.id]);
    expect(restored.activeTabId).toBe(noteA.id);
    expect(restored.history.cursor).toBe(0);
  });

  it("a restore refuses to displace a dirty tab — no append, no move", () => {
    const opened = reduce(
      { type: "open", tab: noteA },
      { type: "open", tab: noteB, placement: "replace-active" },
      { type: "setDirty", tabId: noteB.id, isDirty: true }
    );

    const restored = desktopTabReducer(opened, {
      type: "restoreVisit",
      visitId: opened.history.entries[0]!.id
    });

    // B's unsaved edits are never displaced to satisfy a restore; the user
    // stays put and the cursor does not move.
    expect(restored).toBe(opened);
  });

  it("a default restore of a displaced preview refills the preview slot", () => {
    const opened = reduce(
      { type: "open", tab: noteA, placement: "preview" },
      { type: "open", tab: noteB, placement: "preview" }
    );

    const restored = desktopTabReducer(opened, {
      type: "restoreVisit",
      visitId: opened.history.entries[0]!.id
    });

    // B's preview slot becomes A again — the strip does not grow.
    expect(restored.tabs.map((tab) => tab.id)).toEqual([noteA.id]);
    expect(restored.tabs[0]?.preview).toBe(true);
    expect(restored.activeTabId).toBe(noteA.id);
  });

  it("a restore never records: the Forward tail and entry count hold", () => {
    const opened = reduce(
      { type: "open", tab: noteA },
      { type: "open", tab: noteB, placement: "replace-active" },
      { type: "goBack" }
    );

    const restored = desktopTabReducer(opened, {
      type: "restoreVisit",
      visitId: opened.history.entries[1]!.id
    });

    expect(restored.history.entries).toHaveLength(2);
    expect(restored.history.cursor).toBe(1);
    expect(restored.activeTabId).toBe(noteB.id);
  });
});
