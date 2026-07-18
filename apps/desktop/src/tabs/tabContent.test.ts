import { describe, expect, it } from "vitest";

import { getDocumentForTabResource } from "./tabContent";

describe("tab content lookup", () => {
  it("finds an editor buffer for a preview with a distinct tab ID", () => {
    const document = {
      status: "ready" as const,
      file: {
        rootPath: "C:/notes",
        relativePath: "Roadmap.md",
        fileName: "Roadmap.md"
      },
      savedContents: "# Roadmap",
      editorContents: "# Roadmap\n\nDraft",
      isDirty: true,
      error: null
    };

    expect(
      getDocumentForTabResource(
        { "editor:roadmap": document },
        {
          id: "preview:roadmap",
          title: "Preview: Roadmap.md",
          kind: "preview",
          resource: { rootPath: "C:/notes", relativePath: "Roadmap.md" }
        }
      )
    ).toBe(document);
  });
});
