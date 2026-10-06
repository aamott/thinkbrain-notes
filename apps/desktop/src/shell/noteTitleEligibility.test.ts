import { describe, expect, it } from "vitest";
import { isNoteTitleEligible } from "./noteTitleEligibility";

describe("isNoteTitleEligible", () => {
  it("shows the title row for an ordinary Markdown note", () => {
    expect(isNoteTitleEligible("editor", "notes/readme.md", "journal")).toBe(true);
  });

  it("hides it for non-Markdown files", () => {
    expect(isNoteTitleEligible("editor", "scripts/tool.py", "journal")).toBe(false);
  });

  it("hides it for journal entries under the configured root", () => {
    expect(isNoteTitleEligible("editor", "journal/2026-01-01.md", "journal")).toBe(false);
  });

  it("hides it for non-editor tabs even when the path is Markdown", () => {
    expect(isNoteTitleEligible("settings", "notes/readme.md", "journal")).toBe(false);
    expect(isNoteTitleEligible("code-editor", "notes/readme.md", "journal")).toBe(false);
  });

  it("is null-safe for missing paths", () => {
    expect(isNoteTitleEligible("editor", null, "journal")).toBe(false);
    expect(isNoteTitleEligible("editor", undefined, "journal")).toBe(false);
  });
});
