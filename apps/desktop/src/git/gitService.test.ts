import { describe, expect, it, vi } from "vitest";

import {
  createGitDesktopApi,
  createGitService,
  toGitStatus,
  type GitCommandInvoker,
  type GitDesktopApi
} from "./gitService";

const available = { available: true, version: "git version 2.50.0" } as const;

function createApi(overrides: Partial<GitDesktopApi> = {}): GitDesktopApi {
  return {
    getAvailability: vi.fn().mockResolvedValue(available),
    detectRepository: vi.fn().mockResolvedValue({
      is_repository: true,
      branch: "main"
    }),
    initializeRepository: vi.fn().mockResolvedValue({
      is_repository: true,
      branch: "main"
    }),
    getStatus: vi.fn().mockResolvedValue([]),
    ...overrides
  };
}

describe("Git desktop API", () => {
  it("contains native calls to the typed Git command surface", async () => {
    const commandInvoker = vi.fn(async (command: string) => {
      if (command === "git_availability") {
        return available;
      }

      if (command === "git_status") {
        return [];
      }

      return { is_repository: true, branch: "main" };
    }) as GitCommandInvoker;
    const api = createGitDesktopApi(commandInvoker);

    await expect(api.getAvailability()).resolves.toEqual(available);
    await expect(api.detectRepository("/notes")).resolves.toMatchObject({
      is_repository: true
    });
    await expect(api.initializeRepository("/notes")).resolves.toMatchObject({
      is_repository: true
    });
    await expect(api.getStatus("/notes")).resolves.toEqual([]);

    expect(commandInvoker).toHaveBeenNthCalledWith(1, "git_availability");
    expect(commandInvoker).toHaveBeenNthCalledWith(2, "detect_git_repository", {
      rootPath: "/notes"
    });
    expect(commandInvoker).toHaveBeenNthCalledWith(3, "initialize_git_repository", {
      rootPath: "/notes"
    });
    expect(commandInvoker).toHaveBeenNthCalledWith(4, "git_status", { rootPath: "/notes" });
  });
});

describe("Git service", () => {
  it("caches availability and repository checks for the session", async () => {
    const api = createApi();
    const service = createGitService(api);

    await expect(Promise.all([service.checkAvailability(), service.checkAvailability()])).resolves.toEqual([
      { kind: "available", available: true, version: "git version 2.50.0", message: null },
      { kind: "available", available: true, version: "git version 2.50.0", message: null }
    ]);
    await service.detectRepository("/notes");
    await service.detectRepository("/notes");

    expect(api.getAvailability).toHaveBeenCalledTimes(1);
    expect(api.detectRepository).toHaveBeenCalledTimes(1);

    service.invalidateRepository("/notes");
    await service.detectRepository("/notes");
    expect(api.detectRepository).toHaveBeenCalledTimes(2);
  });

  it("maps repository and non-repository states for the active workspace", async () => {
    const api = createApi({
      detectRepository: vi
        .fn()
        .mockResolvedValueOnce({
          is_repository: true,
          branch: "main"
        })
        .mockResolvedValueOnce({
          is_repository: false,
          branch: null
        })
    });
    const service = createGitService(api);

    await expect(service.detectRepository("/notes")).resolves.toEqual({
      kind: "repository",
      repository: { isRepository: true, rootPath: "/notes", branch: "main" },
      message: null
    });
    await expect(service.detectRepository("/scratch")).resolves.toEqual({
      kind: "not-repository",
      repository: { isRepository: false, rootPath: null, branch: null },
      message: null
    });
  });

  it("normalizes native failures without exposing native details", async () => {
    const unavailableApi = createApi({
      getAvailability: vi.fn().mockRejectedValue(new Error("token=secret"))
    });
    const unavailableService = createGitService(unavailableApi);

    await expect(unavailableService.checkAvailability()).resolves.toEqual({
      kind: "error",
      available: false,
      version: null,
      message: "Git could not be checked. Please try again."
    });
    await expect(unavailableService.detectRepository("/notes")).resolves.toEqual({
      kind: "git-unavailable",
      repository: null,
      message: "Git could not be checked. Please try again."
    });
    expect(unavailableApi.detectRepository).not.toHaveBeenCalled();

    const failedDetectionApi = createApi({
      detectRepository: vi.fn().mockRejectedValue({
        code: "git.command_failed",
        message: "stderr containing a secret"
      })
    });

    await expect(createGitService(failedDetectionApi).detectRepository("/notes")).resolves.toEqual({
      kind: "error",
      repository: null,
      message: "Git repository information could not be loaded. Please try again."
    });
  });

  it("initializes a repository and invalidates stale repository cache entries", async () => {
    const api = createApi({
      detectRepository: vi
        .fn()
        .mockResolvedValueOnce({ is_repository: false, branch: null })
        .mockResolvedValueOnce({ is_repository: true, branch: "main" }),
      initializeRepository: vi.fn().mockResolvedValue({
        is_repository: true,
        branch: "main"
      })
    });
    const service = createGitService(api);

    await expect(service.detectRepository("/notes")).resolves.toMatchObject({
      kind: "not-repository"
    });
    await expect(service.initializeRepository("/notes")).resolves.toEqual({
      kind: "repository",
      repository: { isRepository: true, rootPath: "/notes", branch: "main" },
      message: null
    });
    await expect(service.detectRepository("/notes")).resolves.toMatchObject({
      kind: "repository"
    });

    expect(api.initializeRepository).toHaveBeenCalledWith("/notes");
    expect(api.detectRepository).toHaveBeenCalledTimes(2);
  });

  it("never maps a failed initialization to a repository", async () => {
    const api = createApi({
      initializeRepository: vi.fn().mockRejectedValue(new Error("stderr token=secret"))
    });

    await expect(createGitService(api).initializeRepository("/notes")).resolves.toEqual({
      kind: "error",
      repository: null,
      message: "The repository could not be initialized. Please try again."
    });
  });

  it("groups parsed native status entries and caches status until invalidated", async () => {
    const api = createApi({
      getStatus: vi.fn().mockResolvedValue([
        { path: "staged.md", index_status: "M", worktree_status: " " },
        { path: "both.md", index_status: "R", worktree_status: "M" },
        { path: "changed.md", index_status: " ", worktree_status: "D" },
        { path: "new.md", index_status: "?", worktree_status: "?" }
      ])
    });
    const service = createGitService(api);

    await expect(service.getStatus("/notes")).resolves.toEqual({
      kind: "status",
      status: {
        staged: [
          { path: "staged.md", indexStatus: "M", worktreeStatus: " " },
          { path: "both.md", indexStatus: "R", worktreeStatus: "M" }
        ],
        changed: [
          { path: "both.md", indexStatus: "R", worktreeStatus: "M" },
          { path: "changed.md", indexStatus: " ", worktreeStatus: "D" }
        ],
        untracked: [{ path: "new.md", indexStatus: "?", worktreeStatus: "?" }]
      },
      message: null
    });
    await service.getStatus("/notes");
    expect(api.getStatus).toHaveBeenCalledTimes(1);

    service.invalidateStatus("/notes");
    await service.getStatus("/notes");
    expect(api.getStatus).toHaveBeenCalledTimes(2);
  });

  it("keeps porcelain mapping deterministic for an empty or untracked-only result", () => {
    expect(toGitStatus([])).toEqual({ staged: [], changed: [], untracked: [] });
    expect(toGitStatus([{ path: "draft.md", index_status: "?", worktree_status: "?" }])).toEqual({
      staged: [],
      changed: [],
      untracked: [{ path: "draft.md", indexStatus: "?", worktreeStatus: "?" }]
    });
  });
});
