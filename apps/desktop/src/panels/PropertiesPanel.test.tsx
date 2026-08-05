import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PropertiesPanel } from "./PropertiesPanel";

describe("PropertiesPanel", () => {
  it("renders normalized frontmatter metadata as read-only values", () => {
    const markup = renderToStaticMarkup(
      <PropertiesPanel
        contents={"---\ntitle: Project plan\ntags: [work, planning]\naliases: Project\nstatus: active\ncreated_at: 2026-03-01\nupdated_at: 2026-03-02\n---\n\n# Project plan"}
      />,
    );

    expect(markup).toContain('aria-label="Note properties"');
    expect(markup).toContain("Project plan");
    expect(markup).toContain("work, planning");
    expect(markup).toContain("Project");
    expect(markup).toContain("2026-03-02");
    expect(markup).toContain("Read-only note frontmatter properties");
  });

  it("renders no-note and no-frontmatter states clearly", () => {
    expect(renderToStaticMarkup(<PropertiesPanel contents={null} />)).toContain("No note selected");
    expect(renderToStaticMarkup(<PropertiesPanel contents="# Untitled" />)).toContain("No frontmatter");
  });

  it("renders core frontmatter diagnostics for malformed YAML", () => {
    const markup = renderToStaticMarkup(
      <PropertiesPanel contents={"---\ntitle: [unterminated\n---\n\n# Broken"} />,
    );

    expect(markup).toContain("Frontmatter diagnostics");
    expect(markup).toContain("Error:");
    expect(markup).toContain('role="alert"');
  });

  it("explains an unclosed frontmatter block without inventing metadata", () => {
    const markup = renderToStaticMarkup(<PropertiesPanel contents={"---\ntitle: Missing fence"} />);

    expect(markup).toContain("Invalid frontmatter");
    expect(markup).toContain("has no closing");
    expect(markup).not.toContain("Read-only note frontmatter properties");
  });
});
