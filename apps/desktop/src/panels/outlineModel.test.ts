import { describe, expect, it } from "vitest";

import { extractHeadings, resolveHeadingLine } from "./outlineModel";

describe("extractHeadings", () => {
  it("strips markup from labels: emphasis, code, links, closing marks", () => {
    const headings = extractHeadings(
      [
        "# Title *em* and `code`",
        "## [Docs](https://example.com) plus ![img](i.png)",
        "### A heading with closing marks ###"
      ].join("\n")
    );

    expect(headings).toEqual([
      { level: 1, text: "Title em and code", line: 1 },
      { level: 2, text: "Docs plus img", line: 2 },
      { level: 3, text: "A heading with closing marks", line: 3 }
    ]);
  });

  it("ignores `#` inside fenced code and HTML pseudo-headings", () => {
    // A blank line closes the HTML block before the real heading.
    const headings = extractHeadings(
      ["```", "# fenced, not a heading", "```", "<h1>not a heading</h1>", "", "# Real"].join("\n")
    );

    expect(headings).toEqual([{ level: 1, text: "Real", line: 6 }]);
  });

  it("skips a closed frontmatter block and headings YAML leaks", () => {
    const headings = extractHeadings(
      "---\ntitle: doc\nlist:\n  - ```\n---\n\n# After"
    );

    // The unclosed fence inside YAML must not swallow the body's heading.
    expect(headings).toEqual([{ level: 1, text: "After", line: 7 }]);
  });

  it("counts indented and blockquoted ATX headings", () => {
    const headings = extractHeadings("   # Spaced\n> ## Quoted\n    # code, not a heading");

    expect(headings).toEqual([
      { level: 1, text: "Spaced", line: 1 },
      { level: 2, text: "Quoted", line: 2 }
    ]);
  });

  it("handles CRLF line endings", () => {
    expect(extractHeadings("# One\r\n\r\n## Two\r\n")).toEqual([
      { level: 1, text: "One", line: 1 },
      { level: 2, text: "Two", line: 3 }
    ]);
  });
});

describe("resolveHeadingLine", () => {
  it("matches a heading by its slug — case, spaces and punctuation folded", () => {
    const doc = "intro\n## Getting Started!\nmore";
    expect(resolveHeadingLine(doc, "getting-started")).toBe(2);
    expect(resolveHeadingLine(doc, "Getting Started")).toBe(2);
  });

  it("normalizes Unicode through NFC", () => {
    // NFD heading text vs NFC fragment — the slug normalizes both sides.
    const doc = "# Cafe\u0301 M\u00f6ve";
    expect(resolveHeadingLine(doc, "caf\u00e9-m\u00f6ve")).toBe(1);
  });

  it("assigns duplicate ids in order so repeats and lookalikes stay distinct", () => {
    const doc = "# A\n# A\n# A-1\n# A";
    expect(resolveHeadingLine(doc, "a")).toBe(1);
    expect(resolveHeadingLine(doc, "a-1")).toBe(2);
    expect(resolveHeadingLine(doc, "a-1-1")).toBe(3);
    expect(resolveHeadingLine(doc, "a-2")).toBe(4);
  });

  it("treats an empty fragment as the top of the note", () => {
    expect(resolveHeadingLine("# Anything\nbody", "")).toBe(1);
  });

  it("returns null when nothing matches, including slug-empty headings", () => {
    expect(resolveHeadingLine("# Real\n## !!!\n", "missing")).toBeNull();
    // `!!!` slugs to empty — it claims no id and never matches a fragment.
    expect(resolveHeadingLine("# Real\n## !!!\n", "")).not.toBeNull(); // "" is top
    expect(resolveHeadingLine("# Real\n## !!!\n", "-")).toBeNull();
  });

  it("all-punctuation headings claim no id slot a real heading needs", () => {
    const doc = "# !!!\n# ???\n# -1";
    expect(resolveHeadingLine(doc, "-1")).toBe(3);
  });

  it("keeps lines exact under CRLF and skips frontmatter", () => {
    const doc = "---\r\ntitle: x\r\n---\r\n\r\n# First\r\ntext\r\n## Second";
    expect(extractHeadings(doc)).toEqual([
      { level: 1, text: "First", line: 5 },
      { level: 2, text: "Second", line: 7 }
    ]);
    expect(resolveHeadingLine(doc, "second")).toBe(7);
  });

  it("extracts nothing when frontmatter runs to the end of the file", () => {
    expect(extractHeadings("---\ntitle: only\n---")).toEqual([]);
    expect(extractHeadings("---\ntitle: only\n---\n")).toEqual([]);
  });
});
