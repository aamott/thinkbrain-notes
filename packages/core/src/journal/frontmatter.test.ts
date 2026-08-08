import { describe, expect, it } from "vitest";

import {
  JOURNAL_DATE_KEY,
  buildNewEntryFrontmatter,
  formatJournalDate,
  readJournalMetadata,
  resolveEntryDate,
  validateFieldDefinition
} from "./frontmatter";
import { parseJournalFilename, UNDATED } from "./filename";
import type { JournalEntryRef, JournalFieldDefinition } from "./types";

const ref = (filename: string): JournalEntryRef => {
  const result = parseJournalFilename(filename);
  if (result === UNDATED) throw new Error(`expected ${filename} to parse`);
  return result;
};

// Loosely typed on purpose: these definitions arrive as JSON from settings, so
// the validator's job is to guard input the type system never saw.
const field = (overrides: Record<string, unknown> = {}): unknown => ({
  id: "energy",
  label: "Energy",
  type: "number",
  ...overrides
});

describe("buildNewEntryFrontmatter", () => {
  it("writes the date and nothing else", () => {
    // D22: a new entry is clean until the user sets something.
    expect(buildNewEntryFrontmatter({ year: 2026, month: 8, day: 5 })).toEqual({
      date: "2026-08-05"
    });
  });

  it("zero-pads month and day", () => {
    expect(formatJournalDate({ year: 2026, month: 1, day: 2 })).toBe("2026-01-02");
  });
});

describe("resolveEntryDate", () => {
  it("uses the filename date when frontmatter agrees", () => {
    const resolved = resolveEntryDate(ref("2026-08-07-1307.md"), { date: "2026-08-07" });

    expect(resolved.date).toEqual({ year: 2026, month: 8, day: 7 });
    expect(resolved.diagnostics).toEqual([]);
  });

  it("keeps the filename date and reports a mismatch instead of repairing it", () => {
    // D20: the frontmatter date is a convenience copy, never the source of truth.
    const resolved = resolveEntryDate(ref("2026-08-07-1307.md"), { date: "2026-08-01" });

    expect(resolved.date).toEqual({ year: 2026, month: 8, day: 7 });
    expect(resolved.diagnostics[0]?.code).toBe("journal_date_mismatch");
    expect(resolved.diagnostics[0]?.severity).toBe("warning");
  });

  it("accepts an entry with no frontmatter date at all", () => {
    // D33: frontmatter is not required to be a journal entry.
    const resolved = resolveEntryDate(ref("2026-08-07.md"), {});

    expect(resolved.date).toEqual({ year: 2026, month: 8, day: 7 });
    expect(resolved.diagnostics).toEqual([]);
  });

  it("reports an unparseable frontmatter date without discarding the entry", () => {
    const resolved = resolveEntryDate(ref("2026-08-07.md"), { date: "last Tuesday" });

    expect(resolved.date).toEqual({ year: 2026, month: 8, day: 7 });
    expect(resolved.diagnostics[0]?.code).toBe("journal_date_unreadable");
  });
});

describe("validateFieldDefinition", () => {
  it("accepts a well-formed definition", () => {
    const result = validateFieldDefinition(field());

    expect(result.definition).toEqual({ id: "energy", label: "Energy", type: "number" });
    expect(result.diagnostics).toEqual([]);
  });

  it("requires options for a select field and keeps them", () => {
    const result = validateFieldDefinition(
      field({ id: "mood", label: "Mood", type: "single-select", options: ["good", "flat"] })
    );

    expect(result.definition?.options).toEqual(["good", "flat"]);
  });

  it.each([
    ["a select without options", field({ type: "multi-select" })],
    ["options on a non-select", field({ type: "text", options: ["a"] })],
    ["an unknown type", field({ type: "slider" })],
    ["an id with capitals", field({ id: "Energy" })],
    ["an id with a space", field({ id: "energy level" })],
    ["a missing label", { id: "energy", type: "number" }],
    ["a non-object", "energy"]
  ])("rejects %s", (_label, value) => {
    const result = validateFieldDefinition(value);

    expect(result.definition).toBeNull();
    expect(result.diagnostics.length).toBeGreaterThan(0);
  });

  it.each(["date", "title", "tags", "aliases", "status", "created_at", "updated_at"])(
    "rejects the reserved key %s",
    (id) => {
      // D48 reserves the journal date key and the note model's own fields.
      const result = validateFieldDefinition(field({ id }));

      expect(result.definition).toBeNull();
      expect(result.diagnostics[0]?.code).toBe("journal_field_reserved");
    }
  );
});

describe("readJournalMetadata", () => {
  const definitions: readonly JournalFieldDefinition[] = [
    { id: "mood", label: "Mood", type: "single-select", options: ["good", "flat"] },
    { id: "energy", label: "Energy", type: "number" },
    { id: "context", label: "Context", type: "multi-select", options: ["running", "reading"] },
    { id: "note", label: "Note", type: "text" }
  ];

  it("reads each type into its declared shape", () => {
    const result = readJournalMetadata(
      { date: "2026-08-07", mood: "good", energy: 7, context: ["running"], note: "hi" },
      definitions
    );

    expect(result.values).toEqual({
      mood: "good",
      energy: 7,
      context: ["running"],
      note: "hi"
    });
    expect(result.diagnostics).toEqual([]);
  });

  it("omits fields the note does not carry", () => {
    const result = readJournalMetadata({ date: "2026-08-07", energy: 7 }, definitions);

    expect(result.values).toEqual({ energy: 7 });
  });

  it("keeps an invalid value verbatim, flags it, and excludes it from facets", () => {
    // D50: never coerce — that would invent data the user did not write.
    const result = readJournalMetadata({ energy: "loads" }, definitions);

    expect(result.values.energy).toBeUndefined();
    expect(result.invalid).toEqual({ energy: "loads" });
    expect(result.diagnostics[0]?.code).toBe("journal_field_invalid");
  });

  it("flags a select value outside its options without dropping it from the file", () => {
    const result = readJournalMetadata({ mood: "electric" }, definitions);

    expect(result.values.mood).toBeUndefined();
    expect(result.invalid.mood).toBe("electric");
  });

  it("keeps a value whose definition has been removed, labeled unconfigured", () => {
    // D45: the value stays visible and filterable rather than vanishing.
    const result = readJournalMetadata({ mood: "good" }, []);

    expect(result.unconfigured).toEqual({ mood: "good" });
    expect(result.diagnostics[0]?.code).toBe("journal_field_unconfigured");
  });

  it("treats a field this app never configured the same way", () => {
    // A removed definition and a field written by another tool are
    // indistinguishable from the file alone, so they share one bucket: keep the
    // value, never rewrite it, let the UI label it (D33, D45, D50).
    const result = readJournalMetadata({ date: "2026-08-07", author: "sam" }, definitions);

    expect(result.unconfigured).toEqual({ author: "sam" });
  });

  it("does not treat the date key as a field value or an unconfigured field", () => {
    const result = readJournalMetadata({ date: "2026-08-07" }, definitions);

    expect(result.unconfigured).toEqual({});
    expect(result.values).toEqual({});
  });

  it("exposes the journal date key so callers need not hardcode it", () => {
    expect(JOURNAL_DATE_KEY).toBe("date");
  });
});
