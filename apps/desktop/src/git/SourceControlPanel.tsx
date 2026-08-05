import { useCallback, useEffect, useState, type ReactNode } from "react";
import {
  gitService,
  type GitRepositoryResult,
  type GitService,
  type GitStatus,
  type GitStatusEntry,
  type GitStatusResult
} from "./gitService";
import { createSourceControlRequestGate } from "./sourceControlRequestGate";
import { WorkspaceFileIcon } from "../workspace/WorkspaceFileIcon";

export interface SourceControlPanelProps {
  readonly rootPath: string | null;
  readonly service?: GitService;
}

export type SourceControlPanelState =
  | { readonly kind: "no-workspace" }
  | { readonly kind: "loading" }
  | { readonly kind: "git-missing"; readonly message: string }
  | { readonly kind: "error"; readonly message: string }
  | { readonly kind: "not-repository" }
  | { readonly kind: "initializing" }
  | { readonly kind: "initialize-error"; readonly message: string }
  | {
      readonly kind: "repository";
      readonly branch: string | null;
      readonly status: GitStatus;
      readonly initialized?: boolean;
      readonly isRefreshing?: boolean;
      readonly actionError?: string;
    };

export function SourceControlPanel({ rootPath, service = gitService }: SourceControlPanelProps) {
  const [resolved, setResolved] = useState(() => ({ rootPath, state: initialState(rootPath) }));
  const [requestGate] = useState(createSourceControlRequestGate);
  const state = resolved.rootPath === rootPath ? resolved.state : initialState(rootPath);

  useEffect(() => {
    const operation = requestGate.begin();

    void loadSourceControlState(rootPath, service).then((nextState) => {
      if (requestGate.isCurrent(operation)) setResolved({ rootPath, state: nextState });
    });
  }, [requestGate, rootPath, service]);

  const initializeRepository = useCallback(() => {
    if (!rootPath || state.kind === "initializing") return;

    const operation = requestGate.begin();
    setResolved({ rootPath, state: { kind: "initializing" } });

    void Promise.resolve().then(() => service.initializeRepository(rootPath)).then(async (result) => {
      if (!requestGate.isCurrent(operation)) return;

      if (result.kind === "repository") {
        const nextState = await repositoryState(rootPath, result.repository.branch, service, true);
        if (requestGate.isCurrent(operation)) setResolved({ rootPath, state: nextState });
        return;
      }

      setResolved({ rootPath, state: initializationFailureState(result) });
    }).catch(() => {
      if (requestGate.isCurrent(operation)) {
        setResolved({
          rootPath,
          state: {
            kind: "initialize-error",
            message: "The repository could not be initialized. Please try again."
          }
        });
      }
    });
  }, [requestGate, rootPath, service, state.kind]);

  const refreshStatus = useCallback(() => {
    if (!rootPath || state.kind !== "repository" || state.isRefreshing) return;

    const operation = requestGate.begin();
    setResolved({ rootPath, state: { ...state, actionError: undefined, isRefreshing: true } });
    service.invalidateStatus(rootPath);

    void service.getStatus(rootPath).then((result) => {
      if (!requestGate.isCurrent(operation)) return;
      setResolved({ rootPath, state: refreshedRepositoryState(state, result) });
    }).catch(() => {
      if (requestGate.isCurrent(operation)) {
        setResolved({
          rootPath,
          state: { kind: "error", message: "Git changes could not be loaded. Please try again." }
        });
      }
    });
  }, [requestGate, rootPath, service, state]);

  const updateFiles = useCallback((paths: readonly string[], update: (root: string, filePaths: readonly string[]) => ReturnType<GitService["stageFiles"]>) => {
    if (!rootPath || state.kind !== "repository" || state.isRefreshing || !paths.length) return;

    const operation = requestGate.begin();
    setResolved({ rootPath, state: { ...state, isRefreshing: true } });

    void update(rootPath, paths).then(async (result) => {
      if (!requestGate.isCurrent(operation)) return;
      if (result.kind !== "success") {
        setResolved({ rootPath, state: { ...state, actionError: result.message, isRefreshing: false } });
        return;
      }

      const refreshed = await service.getStatus(rootPath);
      if (requestGate.isCurrent(operation)) {
        setResolved({ rootPath, state: refreshedRepositoryState(state, refreshed) });
      }
    }).catch(() => {
      if (requestGate.isCurrent(operation)) {
        setResolved({
          rootPath,
          state: {
            ...state,
            actionError: "Git changes could not be updated. Please try again.",
            isRefreshing: false
          }
        });
      }
    });
  }, [requestGate, rootPath, service, state]);

  const stageFiles = useCallback((paths: readonly string[]) => {
    updateFiles(paths, (root, filePaths) => service.stageFiles(root, filePaths));
  }, [service, updateFiles]);

  const unstageFiles = useCallback((paths: readonly string[]) => {
    updateFiles(paths, (root, filePaths) => service.unstageFiles(root, filePaths));
  }, [service, updateFiles]);

  return (
    <SourceControlPanelContent
      onInitialize={initializeRepository}
      onRefresh={refreshStatus}
      onStage={stageFiles}
      onUnstage={unstageFiles}
      state={state}
    />
  );
}

/** Fetches panel state without allowing native or service failures into UI copy. */
async function loadSourceControlState(
  rootPath: string | null,
  service: GitService
): Promise<SourceControlPanelState> {
  if (!rootPath) return { kind: "no-workspace" };

  try {
    const availability = await service.checkAvailability();
    if (!availability.available) {
      return availability.kind === "missing"
        ? { kind: "git-missing", message: availability.message }
        : { kind: "error", message: availability.message };
    }

    const repository = await service.detectRepository(rootPath);
    switch (repository.kind) {
      case "repository":
        return repositoryState(rootPath, repository.repository.branch, service);
      case "not-repository":
        return { kind: "not-repository" };
      case "git-unavailable":
        return { kind: "git-missing", message: repository.message };
      case "error":
        return { kind: "error", message: repository.message };
    }
  } catch {
    return {
      kind: "error",
      message: "Source control could not be loaded. Please try again."
    };
  }
}

async function repositoryState(
  rootPath: string,
  branch: string | null,
  service: GitService,
  initialized = false
): Promise<SourceControlPanelState> {
  const result = await service.getStatus(rootPath);
  if (result.kind === "status") {
    return { kind: "repository", branch, status: result.status, initialized };
  }

  return result.kind === "git-unavailable"
    ? { kind: "git-missing", message: result.message }
    : { kind: "error", message: result.message };
}

function refreshedRepositoryState(
  state: Extract<SourceControlPanelState, { kind: "repository" }>,
  result: GitStatusResult
): SourceControlPanelState {
  if (result.kind === "status") {
    return { ...state, actionError: undefined, status: result.status, isRefreshing: false };
  }
  return result.kind === "git-unavailable"
    ? { kind: "git-missing", message: result.message }
    : { kind: "error", message: result.message };
}

export function SourceControlPanelContent({
  state,
  onInitialize,
  onRefresh,
  onStage,
  onUnstage
}: {
  readonly state: SourceControlPanelState;
  readonly onInitialize?: () => void;
  readonly onRefresh?: () => void;
  readonly onStage?: (paths: readonly string[]) => void;
  readonly onUnstage?: (paths: readonly string[]) => void;
}) {
  return (
    <section aria-label="Source control" className="text-foreground flex flex-1 flex-col text-[.8rem] min-h-0 overflow-auto">
      {state.kind === "loading" && <p aria-live="polite" className="items-center text-muted-foreground flex flex-1 flex-col justify-center leading-normal m-0 p-6 text-center" role="status">Checking Git…</p>}
      {state.kind === "no-workspace" && (
        <EmptyState title="Open a workspace">
          Open a workspace to view its Git repository information.
        </EmptyState>
      )}
      {state.kind === "git-missing" && (
        <EmptyState title="Git isn’t available">{state.message}</EmptyState>
      )}
      {state.kind === "error" && (
        <EmptyState alert title="Source control couldn’t load">{state.message}</EmptyState>
      )}
      {state.kind === "not-repository" && (
        <EmptyState title="Not a Git repository">
          <>
            <span>This workspace is not a Git repository.</span>
            <InitializeButton onInitialize={onInitialize} />
          </>
        </EmptyState>
      )}
      {state.kind === "initializing" && (
        <EmptyState title="Initializing repository">
          <span aria-live="polite" role="status">Creating the Git repository…</span>
        </EmptyState>
      )}
      {state.kind === "initialize-error" && (
        <EmptyState alert title="Repository couldn’t initialize">
          <>
            <span>{state.message}</span>
            <InitializeButton onInitialize={onInitialize} />
          </>
        </EmptyState>
      )}
      {state.kind === "repository" && (
        <div className="flex flex-1 flex-col gap-[.8rem] py-[.85rem] px-[.75rem]">
          <div className="items-center flex gap-2 justify-between">
            <h2 className="text-foreground text-[.82rem] m-0 mb-[.45rem] tracking-[.06em] uppercase">Repository</h2>
            <div className="items-center flex gap-2">
              <button
                className="bg-transparent border border-border rounded-small text-foreground cursor-pointer font-inherit text-[.72rem] py-[.3rem] px-[.45rem] focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-2 disabled:cursor-wait disabled:opacity-65"
                disabled={state.isRefreshing || !onStage || stageablePaths(state.status).length === 0}
                onClick={() => onStage?.(stageablePaths(state.status))}
                type="button"
              >
                Stage all
              </button>
              <button
                aria-label="Refresh Git changes"
                className="bg-transparent border border-border rounded-small text-foreground cursor-pointer font-inherit text-[.72rem] py-[.3rem] px-[.45rem] focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-2 disabled:cursor-wait disabled:opacity-65"
                disabled={state.isRefreshing || !onRefresh}
                onClick={onRefresh}
                type="button"
              >
                {state.isRefreshing ? "Refreshing…" : "Refresh"}
              </button>
            </div>
          </div>
          {state.initialized && <p aria-live="polite" role="status" className="m-0 max-w-[18rem] text-muted-foreground text-[.72rem]">Repository initialized.</p>}
          {state.actionError && <p className="bg-[color-mix(in_srgb,var(--tn-color-destructive)_9%,transparent)] border border-[color-mix(in_srgb,var(--tn-color-destructive)_45%,var(--tn-color-border))] rounded-small text-danger text-[.72rem] m-0 py-2 px-[.6rem]" role="alert">{state.actionError}</p>}
          <dl className="border border-border rounded-small m-0">
            <div className="grid grid-cols-[5rem_minmax(0,1fr)]">
              <dt className="m-0 py-2 px-[.6rem] text-muted-foreground">Branch</dt>
              <dd className="m-0 py-2 px-[.6rem] font-mono overflow-hidden text-ellipsis whitespace-nowrap">{state.branch ?? "Detached HEAD"}</dd>
            </div>
          </dl>
          <GitStatusGroups
            isUpdating={state.isRefreshing}
            onStage={onStage}
            onUnstage={onUnstage}
            status={state.status}
          />
        </div>
      )}
    </section>
  );
}

function GitStatusGroups({
  status,
  onStage,
  onUnstage,
  isUpdating = false
}: {
  readonly status: GitStatus;
  readonly onStage?: (paths: readonly string[]) => void;
  readonly onUnstage?: (paths: readonly string[]) => void;
  readonly isUpdating?: boolean;
}) {
  const changeCount = status.staged.length + status.changed.length + status.untracked.length;

  if (!changeCount) {
    return <p className="border border-dashed border-border rounded-small p-[.65rem]">No uncommitted changes.</p>;
  }

  return (
    <div className="flex flex-col gap-[.8rem]">
      <ChangeGroup actionLabel="Unstage" entries={status.staged} isUpdating={isUpdating} onAction={onUnstage} title="Staged" />
      <ChangeGroup actionLabel="Stage" entries={status.changed} isUpdating={isUpdating} onAction={onStage} title="Changed" />
      <ChangeGroup actionLabel="Stage" entries={status.untracked} isUpdating={isUpdating} onAction={onStage} title="Untracked" />
    </div>
  );
}

function ChangeGroup({
  actionLabel,
  entries,
  title,
  onAction,
  isUpdating
}: {
  readonly actionLabel: "Stage" | "Unstage";
  readonly entries: readonly GitStatusEntry[];
  readonly title: string;
  readonly onAction?: (paths: readonly string[]) => void;
  readonly isUpdating: boolean;
}) {
  if (!entries.length) return null;

  return (
    <section aria-label={`${title} files`} className="border border-border rounded-small overflow-hidden">
      <h3 className="items-center bg-accent text-foreground flex text-[.72rem] justify-between tracking-[.04em] m-0 py-[.42rem] px-[.6rem] uppercase">{title} <span className="text-muted-foreground tabular-nums">{entries.length}</span></h3>
      <ul className="list-none m-0 p-0">
        {entries.map((entry) => {
          const { fileName, dirPath } = splitFilePath(entry.path);
          const { letter, className: statusColorClass } = getGitStatusBadge(entry, title);

          return (
            <li key={`${entry.path}:${entry.indexStatus}:${entry.worktreeStatus}`} className="items-center border-t border-border flex gap-2 justify-between min-w-0 py-[.4rem] px-[.6rem]">
              <div className="items-center flex gap-1.5 min-w-0 flex-1 overflow-hidden" title={entry.path}>
                <WorkspaceFileIcon
                  name={fileName}
                  className="w-[0.9rem] h-[0.9rem] flex-none text-muted-foreground stroke-current"
                  aria-hidden="true"
                />
                <span className="text-foreground flex-none max-w-full truncate">{fileName}</span>
                {dirPath && (
                  <span className="text-muted-foreground text-[.72rem] min-w-0 flex-1 truncate font-normal">
                    {dirPath}
                  </span>
                )}
              </div>
              <span className="items-center flex flex-none gap-2">
                {onAction && (
                  <button
                    aria-label={`${actionLabel} ${entry.path}`}
                    className="bg-transparent border border-border rounded-small text-foreground cursor-pointer font-inherit text-[.72rem] py-[.3rem] px-[.45rem] focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-2 disabled:cursor-wait disabled:opacity-65"
                    disabled={isUpdating}
                    onClick={() => onAction([entry.path])}
                    type="button"
                  >
                    {actionLabel}
                  </button>
                )}
                <span
                  aria-label={`${entry.path} Git status: ${letter}`}
                  className={`font-semibold font-mono text-[.75rem] flex-none ${statusColorClass}`}
                >
                  {letter}
                </span>
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function splitFilePath(path: string): { fileName: string; dirPath: string } {
  const normalized = path.replace(/\\/g, "/");
  const lastSlashIndex = normalized.lastIndexOf("/");
  if (lastSlashIndex === -1) {
    return { fileName: normalized, dirPath: "" };
  }
  return {
    fileName: normalized.substring(lastSlashIndex + 1),
    dirPath: normalized.substring(0, lastSlashIndex)
  };
}

function getGitStatusBadge(entry: GitStatusEntry, groupTitle?: string): { letter: string; className: string } {
  if (entry.indexStatus === "?" || entry.worktreeStatus === "?") {
    return { letter: "U", className: "text-success" };
  }

  const code =
    groupTitle === "Staged"
      ? entry.indexStatus.trim() || entry.worktreeStatus.trim() || "M"
      : entry.worktreeStatus.trim() || entry.indexStatus.trim() || "M";

  switch (code) {
    case "A":
      return { letter: "A", className: "text-success" };
    case "D":
      return { letter: "D", className: "text-destructive" };
    case "R":
      return { letter: "R", className: "text-info" };
    case "C":
      return { letter: "C", className: "text-info" };
    case "U":
      return { letter: "U", className: "text-success" };
    case "M":
    default:
      return { letter: code || "M", className: "text-warning" };
  }
}

function stageablePaths(status: GitStatus): readonly string[] {
  return [...new Set([...status.changed, ...status.untracked].map((entry) => entry.path))];
}

function EmptyState({
  alert = false,
  children,
  title
}: {
  readonly alert?: boolean;
  readonly children: ReactNode;
  readonly title: string;
}) {
  return (
    <div className="items-center text-muted-foreground flex flex-1 flex-col justify-center leading-normal m-0 p-6 text-center">
      <h2 className="text-foreground text-[.82rem] m-0 mb-[.45rem]">{title}</h2>
      <div className="m-0 max-w-[18rem]" role={alert ? "alert" : undefined}>{children}</div>
    </div>
  );
}

function InitializeButton({ onInitialize }: { readonly onInitialize?: () => void }) {
  return <button className="bg-accent border border-border rounded-small text-foreground cursor-pointer font-inherit mt-[.9rem] py-[.42rem] px-[.65rem] focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-2 disabled:cursor-wait disabled:opacity-65" disabled={!onInitialize} onClick={onInitialize} type="button">Initialize repository</button>;
}

function initializationFailureState(result: GitRepositoryResult): SourceControlPanelState {
  if (result.kind === "git-unavailable") return { kind: "git-missing", message: result.message };
  if (result.kind === "not-repository") {
    return { kind: "initialize-error", message: "Git did not initialize this workspace as a repository. Please try again." };
  }
  if (result.kind === "repository") {
    return { kind: "initialize-error", message: "The repository status changed unexpectedly. Please try again." };
  }

  return { kind: "initialize-error", message: result.message };
}

function initialState(rootPath: string | null): SourceControlPanelState {
  return rootPath ? { kind: "loading" } : { kind: "no-workspace" };
}
