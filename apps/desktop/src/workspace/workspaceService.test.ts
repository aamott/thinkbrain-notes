import { describe, expect, it } from "vitest";

import { normalizeMarkdownInputPath, toWorkspaceSnapshot } from "./workspaceService";

describe("workspace service", () => {
  it("normalizes note paths for create and rename flows", () => {
    expect(normalizeMarkdownInputPath("Inbox")).toBe("Inbox.md");
    expect(normalizeMarkdownInputPath("\\Projects\\Plan.markdown")).toBe(
      "Projects/Plan.markdown"
    );
    expect(normalizeMarkdownInputPath("  ")).toBe("");
  });

  it("maps native workspace snapshots into frontend types", () => {
    expect(
      toWorkspaceSnapshot({
        workspace: {
          root_path: "C:/notes",
          name: "notes"
        },
        files: [
          {
            relative_path: "Inbox.md",
            file_name: "Inbox.md",
            parent_path: "",
            byte_size: 5,
            updated_at: "123"
          }
        ]
      })
    ).toEqual({
      workspace: {
        rootPath: "C:/notes",
        name: "notes"
      },
      files: [
        {
          relativePath: "Inbox.md",
          fileName: "Inbox.md",
          parentPath: "",
          byteSize: 5,
          updatedAt: "123"
        }
      ]
    });
  });
});
