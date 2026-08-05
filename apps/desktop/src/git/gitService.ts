import {
  invokeNativeCommand,
  type NativeCommandMap,
  type NativeGitAvailability,
  type NativeGitRepository,
  type NativeGitStatusEntry
} from "../native/commands";

type GitCommandName =
  | "git_availability"
  | "detect_git_repository"
  | "initialize_git_repository"
  | "git_status"
  | "stage_git_files"
  | "unstage_git_files";

export interface GitCommandInvoker {
  <TCommand extends GitCommandName>(
    ...[command, args]: NativeCommandMap[TCommand]["args"] extends undefined
      ? [command: TCommand]
      : [command: TCommand, args: NativeCommandMap[TCommand]["args"]]
  ): Promise<NativeCommandMap[TCommand]["result"]>;
}

export interface GitDesktopApi {
  getAvailability(): Promise<NativeGitAvailability>;
  detectRepository(rootPath: string): Promise<NativeGitRepository>;
  initializeRepository(rootPath: string): Promise<NativeGitRepository>;
  getStatus(rootPath: string): Promise<readonly NativeGitStatusEntry[]>;
  stageFiles(rootPath: string, paths: readonly string[]): Promise<void>;
  unstageFiles(rootPath: string, paths: readonly string[]): Promise<void>;
}

export interface GitRepository {
  readonly isRepository: boolean;
  readonly rootPath: string | null;
  readonly branch: string | null;
}

export type GitAvailabilityResult =
  | {
      readonly kind: "available";
      readonly available: true;
      readonly version: string | null;
      readonly message: null;
    }
  | {
      readonly kind: "missing" | "error";
      readonly available: false;
      readonly version: null;
      readonly message: string;
    };

export type GitRepositoryResult =
  | {
      readonly kind: "repository";
      readonly repository: GitRepository;
      readonly message: null;
    }
  | {
      readonly kind: "not-repository";
      readonly repository: GitRepository;
      readonly message: null;
    }
  | {
      readonly kind: "git-unavailable" | "error";
      readonly repository: null;
      readonly message: string;
    };

export interface GitStatusEntry {
  readonly path: string;
  readonly indexStatus: string;
  readonly worktreeStatus: string;
}

export interface GitStatus {
  readonly staged: readonly GitStatusEntry[];
  readonly changed: readonly GitStatusEntry[];
  readonly untracked: readonly GitStatusEntry[];
}

export type GitStatusResult =
  | { readonly kind: "status"; readonly status: GitStatus; readonly message: null }
  | {
      readonly kind: "git-unavailable" | "error";
      readonly status: null;
      readonly message: string;
    };

export type GitMutationResult =
  | { readonly kind: "success"; readonly message: null }
  | { readonly kind: "git-unavailable" | "error"; readonly message: string };

export interface GitService {
  checkAvailability(): Promise<GitAvailabilityResult>;
  detectRepository(rootPath: string): Promise<GitRepositoryResult>;
  initializeRepository(rootPath: string): Promise<GitRepositoryResult>;
  getStatus(rootPath: string): Promise<GitStatusResult>;
  stageFiles(rootPath: string, paths: readonly string[]): Promise<GitMutationResult>;
  unstageFiles(rootPath: string, paths: readonly string[]): Promise<GitMutationResult>;
  invalidateRepository(rootPath?: string): void;
  invalidateStatus(rootPath?: string): void;
  reset(): void;
}

export function createGitDesktopApi(
  commandInvoker: GitCommandInvoker = invokeNativeCommand
): GitDesktopApi {
  return {
    getAvailability: () => commandInvoker("git_availability"),
    detectRepository: (rootPath) =>
      commandInvoker("detect_git_repository", { rootPath }),
    initializeRepository: (rootPath) =>
      commandInvoker("initialize_git_repository", { rootPath }),
    getStatus: (rootPath) => commandInvoker("git_status", { rootPath }),
    stageFiles: (rootPath, paths) => commandInvoker("stage_git_files", { rootPath, paths }).then(() => undefined),
    unstageFiles: (rootPath, paths) => commandInvoker("unstage_git_files", { rootPath, paths }).then(() => undefined)
  };
}

class LruCache<K, V> {
  private map = new Map<K, V>();
  constructor(private maxSize: number) {}

  get(key: K): V | undefined {
    if (!this.map.has(key)) return undefined;
    const value = this.map.get(key)!;
    this.map.delete(key);
    this.map.set(key, value);
    return value;
  }

  set(key: K, value: V): this {
    if (this.map.has(key)) {
      this.map.delete(key);
    } else if (this.map.size >= this.maxSize) {
      const firstKey = this.map.keys().next().value;
      if (firstKey !== undefined) this.map.delete(firstKey);
    }
    this.map.set(key, value);
    return this;
  }

  delete(key: K): boolean {
    return this.map.delete(key);
  }

  deleteIfMatch(key: K, value: V): boolean {
    if (this.map.get(key) === value) {
      return this.map.delete(key);
    }
    return false;
  }

  clear(): void {
    this.map.clear();
  }
}

/**
 * Native Git is optional. This service deliberately returns user-safe states
 * instead of bridge errors so each Git UI can render a useful empty state.
 * Availability and per-workspace detection are cached for the app session;
 * callers invalidate a workspace after an operation such as `git init`.
 */
export function createGitService(api: GitDesktopApi = createGitDesktopApi()): GitService {
  let availability: Promise<GitAvailabilityResult> | undefined;
  const repositories = new LruCache<string, Promise<GitRepositoryResult>>(10);
  const statuses = new LruCache<string, Promise<GitStatusResult>>(10);

  const checkAvailability = () => {
    if (!availability) {
      const promise = api
        .getAvailability()
        .then(toAvailabilityResult)
        .catch(() => {
          if (availability === promise) {
            availability = undefined;
          }
          return toAvailabilityError();
        });
      availability = promise;
    }

    return availability;
  };

  const detectRepository = (rootPath: string) => {
    const cached = repositories.get(rootPath);
    if (cached) {
      return cached;
    }

    const result = checkAvailability().then((git) => {
      if (!git.available) {
        return {
          kind: "git-unavailable" as const,
          repository: null,
          message: git.message
        };
      }

      return api
        .detectRepository(rootPath)
        .then((native) => toRepositoryResult(rootPath, native))
        .catch(toRepositoryError);
    });

    result.then((res) => {
      if (res.kind === "error") {
        repositories.deleteIfMatch(rootPath, result);
      }
    }).catch(() => {});

    repositories.set(rootPath, result);
    return result;
  };

  const initializeRepository = async (rootPath: string): Promise<GitRepositoryResult> => {
    // A previously cached negative result must not survive an initialization
    // attempt. Keep the cache clear on failures too, so a later refresh always
    // asks the native host for the authoritative repository state.
    repositories.delete(rootPath);
    statuses.delete(rootPath);

    const git = await checkAvailability();
    if (!git.available) {
      return {
        kind: "git-unavailable",
        repository: null,
        message: git.message
      };
    }

    try {
      return toRepositoryResult(rootPath, await api.initializeRepository(rootPath));
    } catch {
      return toInitializationError();
    } finally {
      repositories.delete(rootPath);
      statuses.delete(rootPath);
    }
  };

  const getStatus = (rootPath: string) => {
    const cached = statuses.get(rootPath);
    if (cached) return cached;

    const result = checkAvailability().then((git) => {
      if (!git.available) {
        return {
          kind: "git-unavailable" as const,
          status: null,
          message: git.message
        };
      }

      return api.getStatus(rootPath).then(toGitStatusResult).catch(toGitStatusError);
    });

    result.then((res) => {
      if (res.kind === "error") {
        statuses.deleteIfMatch(rootPath, result);
      }
    }).catch(() => {});

    statuses.set(rootPath, result);
    return result;
  };

  const mutateFiles = async (
    rootPath: string,
    paths: readonly string[],
    mutate: (root: string, filePaths: readonly string[]) => Promise<void>
  ): Promise<GitMutationResult> => {
    const git = await checkAvailability();
    if (!git.available) return { kind: "git-unavailable", message: git.message };

    try {
      await mutate(rootPath, paths);
      statuses.delete(rootPath);
      return { kind: "success", message: null };
    } catch {
      return { kind: "error", message: "Git changes could not be updated. Please try again." };
    }
  };

  return {
    checkAvailability,
    detectRepository,
    initializeRepository,
    getStatus,
    stageFiles(rootPath, paths) {
      return mutateFiles(rootPath, paths, api.stageFiles);
    },
    unstageFiles(rootPath, paths) {
      return mutateFiles(rootPath, paths, api.unstageFiles);
    },
    invalidateRepository(rootPath) {
      if (rootPath) {
        repositories.delete(rootPath);
        statuses.delete(rootPath);
        return;
      }

      repositories.clear();
      statuses.clear();
    },
    invalidateStatus(rootPath) {
      if (rootPath) {
        statuses.delete(rootPath);
        return;
      }

      statuses.clear();
    },
    reset() {
      availability = undefined;
      repositories.clear();
      statuses.clear();
    }
  };
}

export const gitService = createGitService();

function toAvailabilityResult({ available, version }: NativeGitAvailability): GitAvailabilityResult {
  if (available) {
    return { kind: "available", available: true, version, message: null };
  }

  return {
    kind: "missing",
    available: false,
    version: null,
    message: "Git is not installed or is not available on your PATH."
  };
}

function toAvailabilityError(): GitAvailabilityResult {
  return {
    kind: "error",
    available: false,
    version: null,
    message: "Git could not be checked. Please try again."
  };
}

function toRepositoryResult(rootPath: string, native: NativeGitRepository): GitRepositoryResult {
  const repository: GitRepository = {
    isRepository: native.is_repository,
    rootPath: native.is_repository ? rootPath : null,
    branch: native.branch
  };

  return native.is_repository
    ? { kind: "repository", repository, message: null }
    : { kind: "not-repository", repository, message: null };
}

function toRepositoryError(): GitRepositoryResult {
  return {
    kind: "error",
    repository: null,
    message: "Git repository information could not be loaded. Please try again."
  };
}

function toInitializationError(): GitRepositoryResult {
  return {
    kind: "error",
    repository: null,
    message: "The repository could not be initialized. Please try again."
  };
}

/** Groups native porcelain codes without exposing native naming to the UI. */
export function toGitStatus(nativeEntries: readonly NativeGitStatusEntry[]): GitStatus {
  const staged: GitStatusEntry[] = [];
  const changed: GitStatusEntry[] = [];
  const untracked: GitStatusEntry[] = [];

  for (const native of nativeEntries) {
    const entry: GitStatusEntry = {
      path: native.path,
      indexStatus: native.index_status,
      worktreeStatus: native.worktree_status
    };

    if (native.index_status === "?" && native.worktree_status === "?") {
      untracked.push(entry);
      continue;
    }

    if (native.index_status !== " ") staged.push(entry);
    if (native.worktree_status !== " ") changed.push(entry);
  }

  return { staged, changed, untracked };
}

function toGitStatusResult(entries: readonly NativeGitStatusEntry[]): GitStatusResult {
  return { kind: "status", status: toGitStatus(entries), message: null };
}

function toGitStatusError(): GitStatusResult {
  return {
    kind: "error",
    status: null,
    message: "Git changes could not be loaded. Please try again."
  };
}
