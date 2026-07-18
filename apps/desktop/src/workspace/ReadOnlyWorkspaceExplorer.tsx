import { useCallback, useEffect, useMemo, useReducer, useRef, useState, type FormEvent } from "react";
import type { NativeWorkspaceEntry, NativeWorkspaceSnapshot } from "../native/commands";
import {
  buildWorkspaceTree,
  initialWorkspaceExplorerState,
  workspaceErrorMessage,
  workspaceExplorerReducer,
  type WorkspaceTreeNode
} from "./workspaceExplorerModel";
import { workspaceDesktopApi, type WorkspaceDesktopApi } from "./workspaceAdapter";
import { workspaceDocumentApi, type WorkspaceDocumentApi } from "./workspaceDocumentAdapter";
import { createWorkspaceDocument } from "./workspaceDocumentModel";
import styles from "./ReadOnlyWorkspaceExplorer.module.css";

export interface ReadOnlyWorkspaceExplorerProps {
  readonly api?: WorkspaceDesktopApi;
  readonly className?: string;
  readonly initialWorkspacePath?: string | null;
  readonly onWorkspaceOpened?: (rootPath: string, snapshot: NativeWorkspaceSnapshot) => void;
  readonly onWorkspaceUnavailable?: (rootPath: string) => void;
  readonly onMarkdownFileSelected?: (rootPath: string, relativePath: string) => void;
  readonly onMarkdownFileCreated?: (rootPath: string, relativePath: string) => void;
  readonly newNoteFocusRequest?: number;
  readonly documentApi?: WorkspaceDocumentApi;
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
  onWorkspaceUnavailable,
  onMarkdownFileSelected,
  onMarkdownFileCreated,
  newNoteFocusRequest = 0,
  documentApi = workspaceDocumentApi
}: ReadOnlyWorkspaceExplorerProps) {
  const [state, dispatch] = useReducer(workspaceExplorerReducer, initialWorkspaceExplorerState);
  const [newNotePath, setNewNotePath] = useState("");
  const [isCreatingNote, setIsCreatingNote] = useState(false);
  const [newNoteError, setNewNoteError] = useState<string | null>(null);
  const newNoteInputRef = useRef<HTMLInputElement>(null);
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

  const createNote = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const rootPath = state.snapshot?.workspace.root_path;
    const relativePath = newNotePath.trim();
    if (!rootPath || !relativePath) return;

    setIsCreatingNote(true);
    setNewNoteError(null);
    const result = await createWorkspaceDocument(documentApi, { rootPath, relativePath });
    if (!result.ok) {
      setNewNoteError(result.message);
      setIsCreatingNote(false);
      return;
    }

    try {
      const entries = await api.listWorkspaceEntries(rootPath);
      dispatch({ type: "opened", snapshot: state.snapshot!, entries });
      setNewNotePath("");
      onMarkdownFileCreated?.(rootPath, result.document.relative_path);
      onMarkdownFileSelected?.(rootPath, result.document.relative_path);
    } catch (error) {
      setNewNoteError(workspaceErrorMessage(error));
    } finally {
      setIsCreatingNote(false);
    }
  };

  useEffect(() => {
    if (initialWorkspacePath) {
      void loadWorkspace(initialWorkspacePath, true);
    }
  }, [initialWorkspacePath, loadWorkspace]);

  useEffect(() => {
    if (newNoteFocusRequest && state.phase === "ready") newNoteInputRef.current?.focus();
  }, [newNoteFocusRequest, state.phase]);

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
              {tree.map((node) => <WorkspaceTreeItem key={node.entry.relative_path} node={node} level={1} onMarkdownFileSelected={(relativePath) => onMarkdownFileSelected?.(state.snapshot!.workspace.root_path, relativePath)} />)}
            </ul>
          )}
          <form className={styles.newNoteForm} onSubmit={createNote}>
            <label htmlFor="new-markdown-note">New note</label>
            <div>
              <input ref={newNoteInputRef} id="new-markdown-note" value={newNotePath} onChange={(event) => setNewNotePath(event.target.value)} placeholder="Notes/untitled.md" disabled={isCreatingNote} />
              <button type="submit" disabled={isCreatingNote || !newNotePath.trim()}>{isCreatingNote ? "Creating…" : "Create"}</button>
            </div>
            {newNoteError && <p role="alert">{newNoteError}</p>}
          </form>
          <p className={styles.readOnlyNote}>Markdown notes can be opened or created here. Other workspace entries remain read-only.</p>
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

function WorkspaceTreeItem({ node, level, onMarkdownFileSelected }: { readonly node: WorkspaceTreeNode; readonly level: number; readonly onMarkdownFileSelected: (relativePath: string) => void }) {
  const isDirectory = node.entry.kind === "directory";
  const isMarkdownFile = node.entry.kind === "file" && node.entry.is_markdown;
  // Directories default to collapsed so the explorer doesn't launch with every folder expanded.
  const [isExpanded, setIsExpanded] = useState(false);
  const toggle = () => setIsExpanded((value) => !value);
  return (
    <li className={styles.treeItem} role="treeitem" aria-level={level} aria-expanded={isDirectory ? isExpanded : undefined}>
      <button
        className={styles.treeRow}
        type="button"
        disabled={!isDirectory && !isMarkdownFile}
        onClick={() => {
          if (isDirectory) toggle();
          else if (isMarkdownFile) onMarkdownFileSelected(node.entry.relative_path);
        }}
        aria-label={isDirectory ? `${isExpanded ? "Collapse" : "Expand"} ${node.entry.name}` : isMarkdownFile ? `Open ${node.entry.name}` : undefined}
      >
        <span className={styles.treeIcon} aria-hidden="true">{isDirectory ? (isExpanded ? "⌄" : "›") : "·"}</span>
        <span className={styles.entryName}>{node.entry.name}</span>
        <EntryKind entry={node.entry} />
      </button>
      {isDirectory && isExpanded && node.children.length > 0 && <ul role="group">{node.children.map((child) => <WorkspaceTreeItem key={child.entry.relative_path} node={child} level={level + 1} onMarkdownFileSelected={onMarkdownFileSelected} />)}</ul>}
    </li>
  );
}

function EntryKind({ entry }: { readonly entry: NativeWorkspaceEntry }) {
  if (entry.kind === "directory") return <span className={styles.entryKind}>Folder</span>;
  return <span className={styles.entryKind}>{entry.is_markdown ? "Markdown" : "File"}</span>;
}
