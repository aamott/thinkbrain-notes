// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";

import { mountPreview, type PreviewHandle } from "../harness";

let preview: PreviewHandle | null = null;

afterEach(() => {
  preview?.destroy();
  preview = null;
});

describe("emphasis live preview", () => {
  it("hides bold markers when the cursor is outside the node", () => {
    preview = mountPreview("a **b** c", 0);
    expect(preview.lineText(1)).toBe("a b c");
  });

  it("reveals bold markers only when the cursor is inside that node", () => {
    preview = mountPreview("a **b** c", 5);
    expect(preview.lineText(1)).toBe("a **b** c");
  });

  it("keeps other nodes on the same line concealed (per-node reveal)", () => {
    // Cursor inside the first bold run; the italic run must stay rendered.
    preview = mountPreview("**x** and *y*", 3);
    expect(preview.lineText(1)).toBe("**x** and y");
  });

  it("hides italic and strikethrough markers", () => {
    // Cursor parked in the plain text between the two nodes: position 0 would
    // sit on the italic node's boundary, which counts as revealed by design.
    preview = mountPreview("*i* and ~~s~~", 5);
    expect(preview.lineText(1)).toBe("i and s");
  });

  it("reveals a node when the cursor rests on its trailing boundary", () => {
    // Typing `**b**` leaves the cursor at the closing marker's end; the run
    // must stay revealed there or the markers would vanish mid-edit.
    preview = mountPreview("a **b** c", 7);
    expect(preview.lineText(1)).toBe("a **b** c");
  });

  it("never alters the document", () => {
    preview = mountPreview("a **b** c", 5);
    expect(preview.view.state.doc.toString()).toBe("a **b** c");
  });
});
