import { useCallback, useEffect, useMemo, useReducer } from "react";
import type { NativeWorkspaceEntry, NativeWorkspaceSnapshot } from "../native/commands";
import {
  buildWorkspaceTree,
  initialWorkspaceExplorerState,
  workspaceErrorMessage,
  workspaceExplorerReducer,
  type WorkspaceTreeNode
} from "./workspaceExplorerModel";
import { workspaceDesktopApi, type WorkspaceDesktopApi } from "./workspaceAdapter";
import styles from "./ReadOnlyWorkspaceExplorer.module.css";

export interface ReadOnlyWorkspaceExplorerProps {
  readonly api?: WorkspaceDesktopApi;
  readonly className?: string;
  readonly initialWorkspacePath?: string | null;
  readonly onWorkspaceOpened?: (rootPath: string, snapshot: NativeWorkspaceSnapshot) => void;
  readonly onWorkspaceUnavailable?: (rootPath: string) => void;
}

/**
 * Folder-open and read-only exploration boundary for the new desktop shell.
 * All filesystem operations stay in the supplied desktop adapter.
 */
export function ReadOnlyWorkspaceExplorer({
  api = workspaceDesktopApi,
  className,
  initialWorkspacePath = null,
  onWorkspaceOpened,
  onWorkspaceUnavailable
}: ReadOnlyWorkspaceExplorerProps) {
  const [state, dispatch] = useReducer(workspaceExplorerReducer, initialWorkspaceExplorerState);
  const tree = useMemo(() => buildWorkspaceTree(state.entries), [state.entries]);

  const loadWorkspace = useCallback(async (rootPath: string, restoring = false) => {
    dispatch({ type: "open" });
    try {
      const snapshot = await api.openWorkspace(rootPath);
      const entries = await api.listWorkspaceEntries(rootPath);
      dispatch({ type: "opened", snapshot, entries });
      onWorkspaceOpened?.(rootPath, snapshot);
    } catch (error) {
      dispatch({ type: "failed", message: workspaceErrorMessage(error) });
      if (restoring) onWorkspaceUnavailable?.(rootPath);
    }
  }, [api, onWorkspaceOpened, onWorkspaceUnavailable]);

  const openWorkspace = async () => {
    dispatch({ type: "pick" });
    try {
      const rootPath = await api.pickWorkspaceDirectory();
      if (!rootPath) {
        dispatch({ type: "cancel" });
        return;
      }

      await loadWorkspace(rootPath);
    } catch (error) {
      dispatch({ type: "failed", message: workspaceErrorMessage(error) });
    }
  };

  useEffect(() => {
    if (initialWorkspacePath) {
      void loadWorkspace(initialWorkspacePath, true);
    }
  }, [initialWorkspacePath, loadWorkspace]);

  const isBusy = state.phase === "picking" || state.phase === "opening";
  const rootClassName = [styles.explorer, className].filter(Boolean).join(" ");

  return (
    <section className={rootClassName} aria-label="Workspace explorer" aria-busy={isBusy}>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>Workspace</p>
          <h2 className={styles.title}>{state.snapshot?.workspace.name ?? "No workspace open"}</h2>
        </div>
        <button className={styles.openButton} type="button" onClick={openWorkspace} disabled={isBusy}>
          {isBusy ? "Opening…" : "Open workspace"}
        </button>
      </header>

      {state.phase === "empty" && <EmptyState />}
      {state.phase === "picking" && <StatusState message="Waiting for a folder selection…" />}
      {state.phase === "opening" && <StatusState message="Reading workspace entries…" />}
      {state.phase === "cancelled" && <StatusState message="Folder selection cancelled." />}
      {state.phase === "error" && <ErrorState message={state.error ?? "The workspace could not be opened."} onDismiss={() => dispatch({ type: "dismiss" })} />}
      {state.phase === "ready" && (
        <div className={styles.treeRegion}>
          <p className={styles.path} title={state.snapshot?.workspace.root_path}>
            {state.snapshot?.workspace.root_path}
          </p>
          {tree.length === 0 ? (
            <StatusState message="This workspace is empty." />
          ) : (
            <ul className={styles.tree} role="tree" aria-label={`${state.snapshot?.workspace.name} files`}>
              {tree.map((node) => <WorkspaceTreeItem key={node.entry.relative_path} node={node} level={1} />)}
            </ul>
          )}
          <p className={styles.readOnlyNote}>Read-only explorer. File actions will appear when their workspace capabilities are available.</p>
        </div>
      )}
    </section>
  );
}

function EmptyState() {
  return <div className={styles.emptyState}><strong>Choose a folder to begin</strong><p>ThinkBrain will show the current folder hierarchy without changing any files.</p></div>;
}

function StatusState({ message }: { readonly message: string }) {
  return <p className={styles.status} role="status">{message}</p>;
}

function ErrorState({ message, onDismiss }: { readonly message: string; readonly onDismiss: () => void }) {
  return <div className={styles.error} role="alert"><strong>Could not open workspace</strong><p>{message}</p><button type="button" onClick={onDismiss}>Dismiss</button></div>;
}

function WorkspaceTreeItem({ node, level }: { readonly node: WorkspaceTreeNode; readonly level: number }) {
  const isDirectory = node.entry.kind === "directory";
  return (
    <li className={styles.treeItem} role="treeitem" aria-level={level} aria-expanded={isDirectory ? true : undefined}>
      <div className={styles.treeRow}>
        <span className={styles.treeIcon} aria-hidden="true">{isDirectory ? "⌄" : "·"}</span>
        <span className={styles.entryName}>{node.entry.name}</span>
        <EntryKind entry={node.entry} />
      </div>
      {node.children.length > 0 && <ul role="group">{node.children.map((child) => <WorkspaceTreeItem key={child.entry.relative_path} node={child} level={level + 1} />)}</ul>}
    </li>
  );
}

function EntryKind({ entry }: { readonly entry: NativeWorkspaceEntry }) {
  if (entry.kind === "directory") return <span className={styles.entryKind}>Folder</span>;
  return <span className={styles.entryKind}>{entry.is_markdown ? "Markdown" : "File"}</span>;
}
