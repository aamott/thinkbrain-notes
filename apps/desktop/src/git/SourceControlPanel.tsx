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
import styles from "./SourceControlPanel.module.css";

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
    setResolved({ rootPath, state: { ...state, isRefreshing: true } });
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

  return (
    <SourceControlPanelContent
      onInitialize={initializeRepository}
      onRefresh={refreshStatus}
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
  if (result.kind === "status") return { ...state, status: result.status, isRefreshing: false };
  return result.kind === "git-unavailable"
    ? { kind: "git-missing", message: result.message }
    : { kind: "error", message: result.message };
}

export function SourceControlPanelContent({
  state,
  onInitialize,
  onRefresh
}: {
  readonly state: SourceControlPanelState;
  readonly onInitialize?: () => void;
  readonly onRefresh?: () => void;
}) {
  return (
    <section aria-label="Source control" className={styles.panel}>
      {state.kind === "loading" && <p aria-live="polite" className={styles.message} role="status">Checking Git…</p>}
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
        <div className={styles.repository}>
          <div className={styles.repositoryHeader}>
            <h2>Repository</h2>
            <button
              aria-label="Refresh Git changes"
              className={styles.refreshButton}
              disabled={state.isRefreshing || !onRefresh}
              onClick={onRefresh}
              type="button"
            >
              {state.isRefreshing ? "Refreshing…" : "Refresh"}
            </button>
          </div>
          {state.initialized && <p aria-live="polite" role="status">Repository initialized.</p>}
          <dl>
            <div>
              <dt>Branch</dt>
              <dd>{state.branch ?? "Detached HEAD"}</dd>
            </div>
          </dl>
          <GitStatusGroups status={state.status} />
        </div>
      )}
    </section>
  );
}

function GitStatusGroups({ status }: { readonly status: GitStatus }) {
  const changeCount = status.staged.length + status.changed.length + status.untracked.length;

  if (!changeCount) {
    return <p className={styles.cleanState}>No uncommitted changes.</p>;
  }

  return (
    <div className={styles.changeGroups}>
      <ChangeGroup entries={status.staged} title="Staged" />
      <ChangeGroup entries={status.changed} title="Changed" />
      <ChangeGroup entries={status.untracked} title="Untracked" />
    </div>
  );
}

function ChangeGroup({ entries, title }: { readonly entries: readonly GitStatusEntry[]; readonly title: string }) {
  if (!entries.length) return null;

  return (
    <section aria-label={`${title} files`} className={styles.changeGroup}>
      <h3>{title} <span>{entries.length}</span></h3>
      <ul>
        {entries.map((entry) => (
          <li key={`${entry.path}:${entry.indexStatus}:${entry.worktreeStatus}`}>
            <span title={entry.path}>{entry.path}</span>
            <code aria-label={`${entry.path} Git status`}>{entry.indexStatus}{entry.worktreeStatus}</code>
          </li>
        ))}
      </ul>
    </section>
  );
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
    <div className={styles.emptyState}>
      <h2>{title}</h2>
      <p role={alert ? "alert" : undefined}>{children}</p>
    </div>
  );
}

function InitializeButton({ onInitialize }: { readonly onInitialize?: () => void }) {
  return <button className={styles.initializeButton} disabled={!onInitialize} onClick={onInitialize} type="button">Initialize repository</button>;
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
