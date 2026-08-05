import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { OutlinePanel } from "./OutlinePanel";
import { extractHeadings } from "./outlineModel";

describe("extractHeadings", () => {
  it("finds ATX headings with their original 1-based document lines", () => {
    const headings = extractHeadings("# Overview\nText\n### Details\n###### Deep dive");

    expect(headings).toEqual([
      { level: 1, text: "Overview", line: 1 },
      { level: 3, text: "Details", line: 3 },
      { level: 6, text: "Deep dive", line: 4 },
    ]);
  });

  it("skips a leading closed frontmatter block without shifting heading lines", () => {
    const headings = extractHeadings("---\ntitle: # Not a heading\n---\n\n# Actual heading");

    expect(headings).toEqual([{ level: 1, text: "Actual heading", line: 5 }]);
  });

  it("does not treat non-ATX heading syntax as an outline entry", () => {
    expect(extractHeadings("Heading\n===\n # Indented\n# Valid")).toEqual([
      { level: 1, text: "Valid", line: 4 },
    ]);
  });
});

describe("OutlinePanel", () => {
  it("renders a navigable nested heading list", () => {
    const markup = renderToStaticMarkup(
      <OutlinePanel contents={"# Overview\n## Details"} onNavigate={() => undefined} />,
    );

    expect(markup).toContain('aria-label="Note outline"');
    expect(markup).toContain('aria-label="Go to line 1: Overview"');
    expect(markup).toContain('aria-label="Go to line 2: Details"');
    expect(markup).toContain("<ul");
  });

  it("renders clear empty states for missing notes and heading-free notes", () => {
    expect(renderToStaticMarkup(<OutlinePanel contents={null} />)).toContain("No note selected");
    expect(renderToStaticMarkup(<OutlinePanel contents="Plain note text" />)).toContain("No headings found");
  });
});
