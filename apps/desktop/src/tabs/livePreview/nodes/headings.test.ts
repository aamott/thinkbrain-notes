// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";

import { mountPreview, type PreviewHandle } from "../harness";

let preview: PreviewHandle | null = null;

afterEach(() => {
  preview?.destroy();
  preview = null;
});

describe("heading live preview", () => {
  it("hides the hash marks when the cursor is elsewhere", () => {
    preview = mountPreview("## hello\n\nbody", 11);
    expect(preview.lineText(1)).toBe("hello");
  });

  it("styles the line as a heading whether or not it is revealed", () => {
    preview = mountPreview("## hello\n\nbody", 11);
    expect(preview.lineClass(1)).toContain("cm-h2");
  });

  it("reveals the hash marks when the cursor is on the line", () => {
    preview = mountPreview("## hello\n\nbody", 4);
    expect(preview.lineText(1)).toBe("## hello");
    expect(preview.lineClass(1)).toContain("cm-h2");
  });

  it("applies the right level class for each heading depth", () => {
    preview = mountPreview("# a\n## b\n### c\n#### d\n##### e\n###### f\n\nx", 40);
    for (let level = 1; level <= 6; level++) {
      expect(preview.lineClass(level)).toContain(`cm-h${level}`);
    }
  });

  it("never alters the document", () => {
    preview = mountPreview("## hello\n\nbody", 11);
    expect(preview.view.state.doc.toString()).toBe("## hello\n\nbody");
  });

  it("leaves frontmatter untouched instead of parsing it as a heading", () => {
    // Without frontmatter suppression the parser reads `title: x` + `---` as a
    // setext H2, which is the bug this guards.
    preview = mountPreview("---\ntitle: x\n---\n\n# real", 22);
    expect(preview.lineText(2)).toBe("title: x");
    expect(preview.lineClass(2)).not.toContain("cm-h2");
  });
});
