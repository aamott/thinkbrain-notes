import { ChangeSet, EditorSelection, type ChangeDesc } from "@codemirror/state";
import { describe, expect, it } from "vitest";

import {
  currentVisit,
  dropTrailVisits,
  emptyTabHistory,
  findVisit,
  HISTORY_LIMIT,
  locationsEqual,
  mapVisitLocations,
  recordVisit,
  resetHistory,
  setVisitLocation,
  updateVisitTabs,
  type DesktopTabHistory,
  type EditorLocation,
  type HistoryVisit,
  type ScrollSnapshot
} from "./tabHistory";
import type { DesktopTab } from "./tabModel";

const note = (id: string, title = id, trailId?: string): DesktopTab => ({
  id,
  title,
  kind: "editor",
  ...(trailId === undefined ? {} : { trailId })
});
const at = (anchor: number, head = anchor): EditorLocation => ({ anchor, head });

/**
 * A scroll snapshot is a CodeMirror `StateEffect` — not constructible without
 * a view — so tests stand in the fields history actually reads: the stored
 * `value` shape for equality, and `map` for re-anchoring.
 */
const fakeSnapshot = (pos: number, margins: { x: number; y: number } = { x: 0, y: 0 }): ScrollSnapshot =>
  ({
    value: {
      range: EditorSelection.cursor(pos),
      xMargin: margins.x,
      yMargin: margins.y
    },
    map: (changes: ChangeDesc) => fakeSnapshot(changes.mapPos(pos, -1), margins)
  }) as unknown as ScrollSnapshot;

const located = (id: number, tab: DesktopTab, location?: EditorLocation): HistoryVisit => ({
  id,
  tab,
  ...(location === undefined ? {} : { location })
});

const historyOf = (entries: readonly HistoryVisit[], cursor = entries.length - 1): DesktopTabHistory => ({
  entries,
  cursor,
  nextVisitId: 100
});

describe("recordVisit", () => {
  it("appends a uniquely-identified visit and lands the cursor on it", () => {
    const history = recordVisit(emptyTabHistory, note("a"));

    expect(history.entries).toEqual([{ id: 1, tab: note("a") }]);
    expect(history.cursor).toBe(0);
    expect(history.nextVisitId).toBe(2);
    expect(currentVisit(history)?.tab.id).toBe("a");
  });

  it("truncates only the active trail's Forward tail, keeping other trails' visits", () => {
    const state = historyOf(
      [
        located(1, note("a", "a", "t1")),
        located(2, note("b", "b", "t1")),
        located(3, note("c", "c", "t2"))
      ],
      0
    );
    const history = recordVisit(state, note("d", "d", "t1"));

    // b's forward visit inside t1 dies; c's visit in t2 stays put.
    expect(history.entries.map((entry) => entry.tab.id)).toEqual(["a", "c", "d"]);
    expect(history.cursor).toBe(2);
  });

  it("re-arriving at the same trail's tip records nothing", () => {
    const state = historyOf([located(1, note("a")), located(2, note("b"))]);

    expect(recordVisit(state, note("b"))).toBe(state);
  });

  it("records the same file as a new visit in a trail that did not arrive there", () => {
    const state = historyOf([located(1, note("a", "a", "t1")), located(2, note("b", "b", "t2"))]);
    const history = recordVisit(state, note("a", "a", "t2"));

    expect(history.entries.map((entry) => entry.tab.id)).toEqual(["a", "b", "a"]);
    expect(history.cursor).toBe(2);
  });

  it("records an in-file visit for the same tab at a different position", () => {
    const state = historyOf([located(1, note("a"), at(0))]);
    const history = recordVisit(state, note("a"), at(42));

    expect(history.entries).toHaveLength(2);
    expect(history.entries[1]).toEqual({ id: 100, tab: note("a"), location: at(42) });
  });

  it("treats a duplicate in-file jump as a no-op", () => {
    const state = historyOf([located(1, note("a"), at(42))]);

    expect(recordVisit(state, note("a"), at(42))).toBe(state);
  });

  it("drops the oldest visits past the bound", () => {
    const entries: HistoryVisit[] = Array.from({ length: HISTORY_LIMIT }, (_, i) =>
      located(i + 1, note(`t${i}`))
    );
    const history = recordVisit(historyOf(entries), note("new"));

    expect(history.entries).toHaveLength(HISTORY_LIMIT);
    expect(history.entries[0]!.tab.id).toBe("t1");
    expect(history.entries.at(-1)!.tab.id).toBe("new");
    expect(history.cursor).toBe(HISTORY_LIMIT - 1);
  });
});

describe("setVisitLocation", () => {
  it("writes the departing position into the named visit, wherever the cursor sits", () => {
    const state = historyOf([located(1, note("a")), located(2, note("b"))], 1);
    const history = setVisitLocation(state, 1, at(17));

    expect(history.entries[0]!.location).toEqual(at(17));
    expect(history.entries[1]!.location).toBeUndefined();
    expect(history.cursor).toBe(1);
  });

  it("refuses to file a capture under a visit since retargeted to another tab", () => {
    const state = historyOf([located(1, note("a"))]);

    expect(setVisitLocation(state, 1, at(5), "other-tab")).toBe(state);
  });

  it("is a no-op for an identical position or an unknown visit", () => {
    const state = historyOf([located(1, note("a"), at(5))]);

    expect(setVisitLocation(state, 1, at(5))).toBe(state);
    expect(setVisitLocation(state, 99, at(5))).toBe(state);
  });
});

describe("mapVisitLocations", () => {
  const doc = "alpha\nbeta\ngamma";

  it("re-anchors stored positions through an insertion", () => {
    const state = historyOf([located(1, note("a"), at(8, 10)), located(2, note("b"), at(3))]);
    const changes = ChangeSet.of({ from: 0, insert: "XX" }, doc.length);

    const history = mapVisitLocations(state, "a", changes);

    expect(history.entries[0]!.location).toMatchObject({ anchor: 10, head: 12 });
    // Other tabs' visits are untouched.
    expect(history.entries[1]!.location).toEqual(at(3));
  });

  it("clamps a position inside a deleted range to the edit site", () => {
    const state = historyOf([located(1, note("a"), at(10))]);
    const changes = ChangeSet.of({ from: 6, to: 13 }, doc.length); // deletes "beta\nga"

    const history = mapVisitLocations(state, "a", changes);

    expect(history.entries[0]!.location).toMatchObject({ anchor: 6, head: 6 });
  });

  it("maps a stored scroll snapshot's target alongside the selection", () => {
    const location: EditorLocation = { ...at(10), scrollSnapshot: fakeSnapshot(10) };
    const state = historyOf([located(1, note("a"), location)]);
    const changes = ChangeSet.of({ from: 0, insert: "XXXX" }, doc.length);

    const history = mapVisitLocations(state, "a", changes);
    const mapped = history.entries[0]!.location!;

    expect(mapped.anchor).toBe(14);
    expect(mapped.scrollSnapshot!.value.range.anchor).toBe(14);
  });

  it("ignores an empty change set", () => {
    const state = historyOf([located(1, note("a"), at(5))]);

    expect(mapVisitLocations(state, "a", ChangeSet.empty(doc.length))).toBe(state);
  });
});

describe("updateVisitTabs", () => {
  it("rewrites a retained descriptor's identity while keeping its position", () => {
    const displaced = { ...note("old"), preview: true };
    const moved = note("new", "Renamed");
    const state = historyOf([located(1, displaced, at(7)), located(2, note("other"))]);

    const history = updateVisitTabs(
      state,
      (tab) => tab.id === "old",
      (tab) => ({ ...moved, preview: tab.preview })
    );

    expect(history.entries[0]!.tab).toMatchObject({ id: "new", title: "Renamed", preview: true });
    expect(history.entries[0]!.location).toEqual(at(7));
    expect(history.entries[1]!.tab.id).toBe("other");
  });
});

describe("dropTrailVisits", () => {
  it("drops every visit for the trail and counts the ones before the cursor", () => {
    const state = historyOf(
      [located(1, note("a")), located(2, note("b")), located(3, note("a")), located(4, note("c"))],
      3
    );

    const { entries, removedBeforeCursor } = dropTrailVisits(state, "a");

    expect(entries.map((entry) => entry.tab.id)).toEqual(["b", "c"]);
    expect(removedBeforeCursor).toBe(2);
  });
});

describe("resetHistory", () => {
  it("keeps only the surviving tab as a fresh visit, preserving the id counter", () => {
    const state = historyOf([located(1, note("a")), located(2, note("b"))], 1);

    const history = resetHistory(state, note("b"));

    expect(history).toEqual({ entries: [{ id: 100, tab: note("b") }], cursor: 0, nextVisitId: 101 });
  });

  it("empties history without losing the id counter when nothing survives", () => {
    const state = historyOf([located(1, note("a"))], 0);
    const history = resetHistory(state, null);

    expect(history.entries).toEqual([]);
    expect(history.cursor).toBe(-1);
    expect(history.nextVisitId).toBe(100);
  });
});

describe("visit lookup", () => {
  it("finds a visit and its index by id", () => {
    const state = historyOf([located(1, note("a")), located(2, note("b"))], 0);

    expect(findVisit(state, 2)).toEqual({ index: 1, visit: located(2, note("b")) });
    expect(findVisit(state, 42)).toBeNull();
  });
});

describe("locationsEqual", () => {
  it("compares snapshots by content, not identity", () => {
    const a: EditorLocation = { ...at(5), scrollSnapshot: fakeSnapshot(5, { x: 0, y: 12 }) };
    const b: EditorLocation = { ...at(5), scrollSnapshot: fakeSnapshot(5, { x: 0, y: 12 }) };
    const c: EditorLocation = { ...at(5), scrollSnapshot: fakeSnapshot(5, { x: 0, y: 13 }) };

    expect(locationsEqual(a, b)).toBe(true);
    expect(locationsEqual(a, c)).toBe(false);
    expect(locationsEqual(a, at(5))).toBe(false);
  });
});
