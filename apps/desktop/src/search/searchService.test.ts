import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../native/commands", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../native/commands")>()),
  invokeNativeCommand: vi.fn()
}));

import { invokeNativeCommand, type NativeSearchHit } from "../native/commands";
import { createSearchService } from "./searchService";

const invoke = vi.mocked(invokeNativeCommand);

const hit: NativeSearchHit = {
  path: "journal/2026-08-13.md",
  file_name: "2026-08-13.md",
  title: "Thursday",
  snippet: "…standup…",
  score: -1.2
};

beforeEach(() => {
  invoke.mockReset();
});

describe("search scope", () => {
  it("searches the whole workspace when the caller names no folder", async () => {
    invoke.mockResolvedValue([]);

    await createSearchService().search("/vault", "standup");

    expect(invoke).toHaveBeenCalledWith("search_index", {
      rootPath: "/vault",
      query: "standup",
      pathPrefix: undefined,
      limit: undefined
    });
  });

  /**
   * The scope has to reach the query itself. A caller that filtered the results
   * afterwards would be handed whatever of its folder outranked the rest of the
   * vault — which is few notes in a vault where the folder is a small part.
   */
  it("passes a folder and a limit down to the native query", async () => {
    invoke.mockResolvedValue([hit]);

    await expect(
      createSearchService().search("/vault", "standup", { pathPrefix: "journal", limit: 200 })
    ).resolves.toEqual([
      {
        relativePath: "journal/2026-08-13.md",
        fileName: "2026-08-13.md",
        title: "Thursday",
        snippet: "…standup…",
        score: -1.2
      }
    ]);
    expect(invoke).toHaveBeenCalledWith("search_index", {
      rootPath: "/vault",
      query: "standup",
      pathPrefix: "journal",
      limit: 200
    });
  });
});
