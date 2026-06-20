import type { MarkdownFileEntry } from "@thinkbrain/core";
import { describe, expect, it } from "vitest";

import { buildDocumentRecord } from "./searchService";

const fileEntry: MarkdownFileEntry = {
  relativePath: "projects/roadmap.md",
  fileName: "roadmap.md",
  parentPath: "projects",
  byteSize: 120,
  updatedAt: "123"
};

describe("search service", () => {
  it("builds an index record from parsed note metadata", () => {
    const contents = [
      "---",
      "title: Quarterly Roadmap",
      "tags: [planning]",
      "aliases: [Q3 Plan]",
      "---",
      "Body mentions an #inline tag and details."
    ].join("\n");

    const record = buildDocumentRecord(fileEntry, contents);

    expect(record.path).toBe("projects/roadmap.md");
    expect(record.fileName).toBe("roadmap.md");
    expect(record.title).toBe("Quarterly Roadmap");
    // Frontmatter and inline tags are merged by the shared core parser.
    expect(record.tags).toEqual(["planning", "inline"]);
    expect(record.aliases).toEqual(["Q3 Plan"]);
    // The body excludes frontmatter so the index never matches YAML keys.
    expect(record.body).toContain("Body mentions an #inline tag");
    expect(record.body).not.toContain("title:");
  });

  it("omits the title when no frontmatter title is present", () => {
    const record = buildDocumentRecord(fileEntry, "# Heading only\n");

    expect(record.title).toBeUndefined();
    expect(record.tags).toEqual([]);
    expect(record.aliases).toEqual([]);
  });
});
