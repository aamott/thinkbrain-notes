import { ChangeSet } from "@codemirror/state";
import { describe, expect, it } from "vitest";

import {
  canGoBackInTabs,
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
      { type: "open", tab: noteB },
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

  it("restoreVisit lands on a visit by id without recording", () => {
    const opened = reduce(
      { type: "open", tab: noteA },
      { type: "open", tab: noteB }
    );
    const visitId = opened.history.entries[0]!.id;
    const state = desktopTabReducer(opened, { type: "restoreVisit", visitId });

    expect(state.activeTabId).toBe(noteA.id);
    expect(state.history.cursor).toBe(0);
    expect(state.history.entries).toHaveLength(2);
    // Unknown ids are a no-op.
    expect(desktopTabReducer(opened, { type: "restoreVisit", visitId: 999 })).toBe(opened);
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


describe("restore placement", () => {
  const noteA = createEditorTab({ rootPath: "/notes", relativePath: "a.md" });
  const noteB = createEditorTab({ rootPath: "/notes", relativePath: "b.md" });

  it('"replace-active" restore refills the tab in use for an absent destination', () => {
    const opened = reduce(
      { type: "open", tab: noteA },
      { type: "open", tab: noteB, placement: "replace-active" }
    );
    expect(opened.tabs.map((tab) => tab.id)).toEqual([noteB.id]);

    const restored = desktopTabReducer(opened, {
      type: "restoreVisit",
      visitId: opened.history.entries[0]!.id,
      placement: "replace-active"
    });

    expect(restored.tabs.map((tab) => tab.id)).toEqual([noteA.id]);
    expect(restored.activeTabId).toBe(noteA.id);
    expect(restored.history.cursor).toBe(0);
  });

  it('"replace-active" restore appends rather than displace a dirty tab', () => {
    const opened = reduce(
      { type: "open", tab: noteA },
      { type: "open", tab: noteB, placement: "replace-active" },
      { type: "setDirty", tabId: noteB.id, isDirty: true }
    );

    const restored = desktopTabReducer(opened, {
      type: "restoreVisit",
      visitId: opened.history.entries[0]!.id,
      placement: "replace-active"
    });

    // Nothing reusable means the destination simply appends — B's unsaved
    // edits are never displaced to satisfy a restore.
    expect(restored.tabs.map((tab) => tab.id)).toEqual([noteB.id, noteA.id]);
    expect(restored.activeTabId).toBe(noteA.id);
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
      { type: "open", tab: noteB },
      { type: "goBack" }
    );

    const restored = desktopTabReducer(opened, {
      type: "restoreVisit",
      visitId: opened.history.entries[1]!.id,
      placement: "replace-active"
    });

    expect(restored.history.entries).toHaveLength(2);
    expect(restored.history.cursor).toBe(1);
    expect(restored.activeTabId).toBe(noteB.id);
  });
});
