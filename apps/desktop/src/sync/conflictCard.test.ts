import { describe, expect, it } from "vitest";

import { describeSize, describeWhen, noteName, treatmentOf } from "./conflictCard";
import type { ConflictKind, ConflictSummary } from "./conflictTypes";

const summary = (path: string, kind: ConflictKind): ConflictSummary => ({
  kind,
  ours: { path, label: "This computer", byteSize: 1, changedAt: null, fingerprint: "a" },
  theirs: { path: `${path}.copy`, label: "Syncthing", byteSize: 1, changedAt: null, fingerprint: "b" }
});

describe("treatmentOf", () => {
  it("offers a review for a note that can be compared", () => {
    expect(treatmentOf(summary("Meeting Notes.md", "text"))).toBe("review");
  });

  it("shows two pictures for an image", () => {
    for (const name of ["diagram.png", "photo.JPG", "logo.svg", "shot.webp"]) {
      expect(treatmentOf(summary(name, "binary"))).toBe("image");
    }
  });

  // A .canvas file is JSON, so a line-by-line comparison is technically
  // possible and completely useless. Saying so beats offering it.
  it("says a whiteboard cannot be compared, even though it is text", () => {
    expect(treatmentOf(summary("Product Roadmap.canvas", "text"))).toBe("whiteboard");
  });

  it("falls back to a plain file for anything else", () => {
    expect(treatmentOf(summary("budget.xlsx", "binary"))).toBe("file");
  });

  it("offers keep or delete when one side deleted the note", () => {
    expect(
      treatmentOf({
        ...summary("Meeting Notes.md", "text"),
        decision: "keepOrDelete"
      })
    ).toBe("keepOrDelete");
  });

  // An SVG is text, and comparing its markup line by line is not what anyone
  // opening a picture wants to see.
  it("treats a picture as a picture even when its bytes are text", () => {
    expect(treatmentOf(summary("logo.svg", "text"))).toBe("image");
  });
});

describe("noteName", () => {
  it("takes the file name out of a workspace path", () => {
    expect(noteName("journal/2026/08-16.md")).toBe("08-16.md");
  });

  it("leaves a bare name alone", () => {
    expect(noteName("note.md")).toBe("note.md");
  });
});

describe("describeSize", () => {
  it("counts small files in bytes", () => {
    expect(describeSize(0)).toBe("0 bytes");
    expect(describeSize(1)).toBe("1 byte");
    expect(describeSize(999)).toBe("999 bytes");
  });

  it("moves up a unit once the number stops being readable", () => {
    expect(describeSize(219_136)).toBe("214 KB");
    expect(describeSize(5_242_880)).toBe("5.0 MB");
  });
});

describe("describeWhen", () => {
  it("says so plainly when the filesystem would not give a time", () => {
    expect(describeWhen(null)).toBe("Unknown");
  });

  it("renders a real time as something", () => {
    expect(describeWhen(Date.UTC(2026, 7, 16, 12, 0))).not.toBe("Unknown");
  });
});
