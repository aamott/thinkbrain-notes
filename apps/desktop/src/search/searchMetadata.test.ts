import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../native/commands", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../native/commands")>()),
  invokeNativeCommand: vi.fn()
}));

import {
  invokeNativeCommand,
  type NativeDocumentInput,
  type NativeMarkdownFileContents
} from "../native/commands";
import { createSearchService } from "./searchService";
import { useSearchIndexStore } from "./searchIndexStore";

const invoke = vi.mocked(invokeNativeCommand);
const query = {
  pathPrefix: "journal",
  facetKeys: ["project"],
  predicates: [{ key: "status", value: "draft" }]
} as const;

beforeEach(() => {
  invoke.mockReset();
  useSearchIndexStore.setState({
    rootPath: null,
    status: { kind: "no-workspace" }
  });
});

describe("search metadata indexing", () => {
  it("carries arbitrary flattened frontmatter through incremental indexing", async () => {
    invoke.mockImplementation(async (command: string) => {
      if (command === "read_markdown_file") {
        return {
          relative_path: "journal/entry.md",
          contents: `---
project: Atlas
rating: 4.5
activities: [walk, read, walk]
---
Body`
        } satisfies NativeMarkdownFileContents;
      }
      if (command === "index_documents") return 1;
      throw new Error(`Unexpected command: ${command}`);
    });

    await createSearchService().indexDocument("/vault", "journal/entry.md");

    const indexCall = invoke.mock.calls.find(([command]) => command === "index_documents");
    const documents = (
      indexCall?.[1] as { readonly documents: readonly NativeDocumentInput[] } | undefined
    )?.documents;
    expect(documents).toEqual([
      expect.objectContaining({
        path: "journal/entry.md",
        body: "Body",
        metadata: [
          { key: "activities", values: ["walk", "read"] },
          { key: "project", values: ["Atlas"] },
          { key: "rating", values: [4.5] }
        ]
      })
    ]);
  });

  it("keeps malformed frontmatter in ordinary search while omitting metadata", async () => {
    const markdown = "---\ntitle: [unterminated\n---\nSearchable body";
    invoke.mockImplementation(async (command: string) => {
      if (command === "read_markdown_file") {
        return { relative_path: "broken.md", contents: markdown } satisfies NativeMarkdownFileContents;
      }
      if (command === "index_documents") return 1;
      throw new Error(`Unexpected command: ${command}`);
    });

    await createSearchService().indexDocument("/vault", "broken.md");

    const indexCall = invoke.mock.calls.find(([command]) => command === "index_documents");
    const document = (
      indexCall?.[1] as { readonly documents: readonly NativeDocumentInput[] } | undefined
    )?.documents[0];
    expect(document).toMatchObject({ body: markdown, metadata: [] });
  });

  it("carries metadata through a full rebuild and maps metadata query results", async () => {
    invoke.mockImplementation(async (command: string) => {
      if (command === "clear_index") return null;
      if (command === "read_markdown_file") {
        return {
          relative_path: "journal/entry.md",
          contents: "---\nproject: Atlas\n---\nBody"
        } satisfies NativeMarkdownFileContents;
      }
      if (command === "index_documents") return 1;
      if (command === "query_index_metadata") {
        return {
          facets: [{ key: "project", values: ["Atlas"] }],
          matching_paths: ["journal/entry.md"]
        };
      }
      throw new Error(`Unexpected command: ${command}`);
    });
    const service = createSearchService();

    await expect(
      service.indexWorkspace(
        "/vault",
        [
          {
            relative_path: "journal/entry.md",
            file_name: "entry.md",
            parent_path: "journal",
            byte_size: 10,
            updated_at: null
          }
        ],
        { batchSize: 1 }
      )
    ).resolves.toBe(1);
    const indexCall = invoke.mock.calls.find(([command]) => command === "index_documents");
    const indexedDocuments = (
      indexCall?.[1] as { readonly documents: readonly NativeDocumentInput[] } | undefined
    )?.documents;
    expect(indexedDocuments?.[0]?.metadata).toEqual([{ key: "project", values: ["Atlas"] }]);
    await expect(service.queryMetadata("/vault", query)).resolves.toEqual({
      facets: [{ key: "project", values: ["Atlas"] }],
      matchingPaths: ["journal/entry.md"]
    });
    expect(invoke).toHaveBeenCalledWith("query_index_metadata", {
      rootPath: "/vault",
      pathPrefix: "journal",
      facetKeys: ["project"],
      predicates: [{ key: "status", value: "draft" }]
    });
  });
});

describe("search metadata availability", () => {
  it("returns typed unavailable results without invoking native queries", async () => {
    await expect(useSearchIndexStore.getState().queryMetadata("/vault", query)).resolves.toEqual({
      kind: "unavailable",
      reason: "no-workspace"
    });

    useSearchIndexStore.setState({
      rootPath: "/vault",
      status: { kind: "indexing", progress: null }
    });
    await expect(useSearchIndexStore.getState().queryMetadata("/vault", query)).resolves.toEqual({
      kind: "unavailable",
      reason: "indexing"
    });
    expect(invoke).not.toHaveBeenCalled();
  });

  it("returns typed failures for an unhealthy index or native query error", async () => {
    useSearchIndexStore.setState({
      rootPath: "/vault",
      status: { kind: "error", message: "Index build failed." }
    });
    await expect(useSearchIndexStore.getState().queryMetadata("/vault", query)).resolves.toEqual({
      kind: "failure",
      message: "Index build failed."
    });

    useSearchIndexStore.setState({ rootPath: "/vault", status: { kind: "ready" } });
    invoke.mockRejectedValue(new Error("SQLite unavailable"));
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    await expect(useSearchIndexStore.getState().queryMetadata("/vault", query)).resolves.toEqual({
      kind: "failure",
      message: "SQLite unavailable"
    });
    expect(error).toHaveBeenCalledOnce();
    error.mockRestore();
  });

  it("returns available facets and paths only for the active ready workspace", async () => {
    useSearchIndexStore.setState({ rootPath: "/vault", status: { kind: "ready" } });
    invoke.mockResolvedValue({
      facets: [{ key: "project", values: ["Atlas"] }],
      matching_paths: ["journal/entry.md"]
    });

    await expect(useSearchIndexStore.getState().queryMetadata("/vault", query)).resolves.toEqual({
      kind: "available",
      facets: [{ key: "project", values: ["Atlas"] }],
      matchingPaths: ["journal/entry.md"]
    });
    await expect(useSearchIndexStore.getState().queryMetadata("/other", query)).resolves.toEqual({
      kind: "unavailable",
      reason: "workspace-mismatch"
    });
  });

  it("does not return stale results or failures after the active workspace changes", async () => {
    useSearchIndexStore.setState({ rootPath: "/vault", status: { kind: "ready" } });
    invoke.mockImplementation(async () => {
      useSearchIndexStore.setState({ rootPath: "/other", status: { kind: "ready" } });
      return {
        facets: [{ key: "project", values: ["Atlas"] }],
        matching_paths: ["journal/entry.md"]
      };
    });

    await expect(useSearchIndexStore.getState().queryMetadata("/vault", query)).resolves.toEqual({
      kind: "unavailable",
      reason: "workspace-mismatch"
    });

    useSearchIndexStore.setState({ rootPath: "/vault", status: { kind: "ready" } });
    invoke.mockImplementation(async () => {
      useSearchIndexStore.setState({ rootPath: null, status: { kind: "no-workspace" } });
      throw new Error("stale failure");
    });
    await expect(useSearchIndexStore.getState().queryMetadata("/vault", query)).resolves.toEqual({
      kind: "unavailable",
      reason: "no-workspace"
    });
  });
});
