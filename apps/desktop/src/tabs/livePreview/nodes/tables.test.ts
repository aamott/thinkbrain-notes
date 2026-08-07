// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";

import { mountPreview, type PreviewHandle } from "../harness";

let preview: PreviewHandle | null = null;

afterEach(() => {
  preview?.destroy();
  preview = null;
});

const TABLE = ["| a | b |", "| - | - |", "| 1 | 2 |", "", "after"].join("\n");

describe("table live preview", () => {
  it("styles every table line monospaced so columns line up", () => {
    preview = mountPreview(TABLE, 30);
    expect(preview.lineClass(1)).toContain("cm-table-line");
    expect(preview.lineClass(2)).toContain("cm-table-line");
    expect(preview.lineClass(3)).toContain("cm-table-line");
  });

  it("emphasises the header row", () => {
    preview = mountPreview(TABLE, 30);
    expect(preview.lineClass(1)).toContain("cm-table-header");
    expect(preview.lineClass(3)).not.toContain("cm-table-header");
  });

  it("hides the delimiter row when the cursor is away from it", () => {
    preview = mountPreview(TABLE, 30);
    expect(preview.lineText(2)).toBe("");
    expect(preview.lineClass(2)).toContain("cm-table-delimiter");
  });

  it("reveals the delimiter row when the cursor is on it", () => {
    preview = mountPreview(TABLE, 12);
    expect(preview.lineText(2)).toBe("| - | - |");
  });

  it("keeps the cell pipes visible", () => {
    preview = mountPreview(TABLE, 30);
    expect(preview.lineText(1)).toBe("| a | b |");
    expect(preview.lineText(3)).toBe("| 1 | 2 |");
  });

  it("never alters the document", () => {
    preview = mountPreview(TABLE, 12);
    expect(preview.view.state.doc.toString()).toBe(TABLE);
  });
});
