import { describe, expect, it } from "vitest";

import { parseFrontmatter } from "../frontmatter";
import { parseJournalFilename, UNDATED } from "./filename";
import { readJournalMetadata, resolveEntryDate } from "./frontmatter";
import type { JournalFieldDefinition } from "./types";

/**
 * The journal composed with the generic note parser, against the fixtures in
 * `plans/journal-calendar/assets/journal-frontmatter-examples.md`.
 *
 * These prove the property the contract actually promises: a file is described,
 * never repaired, and nothing the user wrote is discarded (D33, D50).
 */

const definitions: readonly JournalFieldDefinition[] = [
  { id: "mood", label: "Mood", type: "single-select", options: ["good", "flat"] },
  { id: "energy", label: "Energy", type: "number" },
  { id: "context", label: "Context", type: "multi-select", options: ["running", "reading"] }
];

/** Reads a note exactly as the app would: filename first, then frontmatter. */
function readEntry(filename: string, markdown: string) {
  const ref = parseJournalFilename(filename);
  if (ref === UNDATED) throw new Error(`expected ${filename} to parse`);
  const parsed = parseFrontmatter(markdown);
  return {
    ref,
    body: parsed.body,
    date: resolveEntryDate(ref, parsed.metadata),
    metadata: readJournalMetadata(parsed.metadata, definitions),
    parseDiagnostics: parsed.diagnostics
  };
}

describe("reading a journal entry", () => {
  it("reads a full entry into its declared shapes", () => {
    const entry = readEntry(
      "2026-08-07-1307.md",
      "---\ndate: 2026-08-07\nmood: good\nenergy: 7\ncontext: [running, reading]\n---\nRan early.\n"
    );

    expect(entry.metadata.values).toEqual({
      mood: "good",
      energy: 7,
      context: ["running", "reading"]
    });
    expect(entry.body.trim()).toBe("Ran early.");
    expect(entry.date.diagnostics).toEqual([]);
  });

  it("keeps an entry whose frontmatter is malformed YAML", () => {
    // D33: only an unreadable or ambiguous filename date disqualifies an entry.
    const entry = readEntry("2026-08-07.md", "---\ndate: 2026-08-07\nmood: [good\n---\nStill mine.\n");

    expect(entry.date.date).toEqual({ year: 2026, month: 8, day: 7 });
    expect(entry.parseDiagnostics.length).toBeGreaterThan(0);
    expect(entry.body).toContain("Still mine.");
  });

  it("keeps an entry that has no frontmatter at all", () => {
    const entry = readEntry("2026-08-07.md", "Ran before the heat came in.\n");

    expect(entry.date.date).toEqual({ year: 2026, month: 8, day: 7 });
    expect(entry.date.diagnostics).toEqual([]);
    expect(entry.metadata.values).toEqual({});
  });

  it("keeps an unknown field and an invalid value verbatim in one read", () => {
    const entry = readEntry(
      "2026-08-07.md",
      "---\ndate: 2026-08-07\nauthor: sam\nenergy: loads\n---\n"
    );

    expect(entry.metadata.unconfigured).toEqual({ author: "sam" });
    expect(entry.metadata.invalid).toEqual({ energy: "loads" });
    expect(entry.metadata.values).toEqual({});
  });

  it("prefers the filename date over a disagreeing frontmatter date", () => {
    const entry = readEntry("2026-08-07-1307.md", "---\ndate: 2026-08-01\n---\n");

    expect(entry.date.date).toEqual({ year: 2026, month: 8, day: 7 });
    expect(entry.date.diagnostics[0]?.code).toBe("journal_date_mismatch");
  });

  it("keeps an entry with duplicate frontmatter keys, reading no metadata from it", () => {
    // The generic parser rejects duplicate keys outright rather than picking a
    // winner, so the note reads as if it had no frontmatter — but it is still an
    // entry (D33), and nothing is rewritten to "fix" it.
    const entry = readEntry("2026-08-07.md", "---\nenergy: 3\nenergy: 7\n---\nStill mine.\n");

    expect(entry.date.date).toEqual({ year: 2026, month: 8, day: 7 });
    expect(entry.metadata.values).toEqual({});
    expect(entry.parseDiagnostics[0]?.message).toContain("unique");
  });
});
