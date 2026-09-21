import { describe, expect, it } from "vitest";

import { rowName } from "./journalRowUtils";
import type { JournalRow } from "./journalViewModel";

const row = (overrides: Partial<JournalRow>): JournalRow => ({
  kind: "entry",
  key: "journal/2026-08-07-1802.md",
  label: "2026-08-07-1802.md",
  count: null,
  collapsed: null,
  matchCount: null,
  dateLabel: "Fri 7",
  timeLabel: "6:02 PM",
  preview: null,
  ...overrides
});

describe("rowName", () => {
  it("appends a trimmed preview to a dated entry", () => {
    expect(rowName(row({ preview: "  Bread needed more salt.  " }))).toBe(
      "Fri 7, 6:02 PM, Bread needed more salt."
    );
  });

  it("appends a preview to an undated entry", () => {
    expect(
      rowName(
        row({
          kind: "undated-entry",
          label: "scratch.md",
          dateLabel: null,
          timeLabel: null,
          preview: "An unfinished thought"
        })
      )
    ).toBe("scratch.md, An unfinished thought");
  });

  it("leaves the existing name unchanged for a blank preview", () => {
    expect(rowName(row({ preview: "  \n " }))).toBe("Fri 7, 6:02 PM");
  });

  it("preserves group counts", () => {
    expect(
      rowName(
        row({
          kind: "month",
          label: "August",
          count: 2,
          collapsed: false,
          dateLabel: null,
          timeLabel: null,
          preview: "ignored"
        })
      )
    ).toBe("August, 2 entries");
  });
});
