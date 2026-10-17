// @vitest-environment happy-dom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
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
  it("renders a nested heading list", () => {
    const markup = renderToStaticMarkup(
      <OutlinePanel contents={"# Overview\n## Details"} />,
    );

    expect(markup).toContain('aria-label="Note outline"');
    expect(markup).toContain("Overview");
    expect(markup).toContain("Details");
    expect(markup).toContain("<ul");
  });

  it("renders clear empty states for missing notes and heading-free notes", () => {
    expect(renderToStaticMarkup(<OutlinePanel contents={null} />)).toContain("No note selected");
    expect(renderToStaticMarkup(<OutlinePanel contents="Plain note text" />)).toContain("No headings found");
  });

  it("renders jump buttons only when the chrome offers navigation", () => {
    const readonly = renderToStaticMarkup(<OutlinePanel contents={"# Overview"} />);
    expect(readonly).not.toContain("<button");

    const navigable = renderToStaticMarkup(
      <OutlinePanel contents={"# Overview"} onNavigate={() => undefined} />
    );
    expect(navigable).toContain("<button");
    expect(navigable).toContain("Go to Overview");
  });
});

describe("OutlinePanel heading jumps", () => {
  let root: Root | null = null;
  let container: HTMLDivElement | null = null;

  afterEach(async () => {
    await act(async () => root?.unmount());
    root = null;
    container?.remove();
    container = null;
  });

  it("hands the clicked heading's 1-based line to onNavigate", async () => {
    const onNavigate = vi.fn();
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    await act(async () => {
      root!.render(
        <OutlinePanel contents={"intro\n# Overview\ntext\n## Details"} onNavigate={onNavigate} />
      );
    });

    const buttons = [...container.querySelectorAll("button")];
    expect(buttons.map((button) => button.textContent)).toEqual(["Overview", "Details"]);

    await act(async () => buttons[1]!.click());
    expect(onNavigate).toHaveBeenCalledWith(4);
    await act(async () => buttons[0]!.click());
    expect(onNavigate).toHaveBeenCalledWith(2);
  });
});
