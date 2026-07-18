import type { MarkdownFileEntry } from "@thinkbrain/core";
import { Button } from "@thinkbrain/ui";
import { useMemo, useState } from "react";

import { normalizeNativeError } from "../native/commands";
import { indexDocument, removeIndexedDocument } from "../search/searchService";
import { useAppStore } from "../stores/appStore";
import { FileTree } from "./FileTree";
import { buildFileTree } from "./fileTreeModel";
import { openNoteDocument } from "./openNote";
import styles from "./WorkspaceExplorer.module.css";
import {
  createMarkdownFile,
  deleteMarkdownFile,
  listMarkdownFiles,
  listWorkspaceEntries,
  normalizeMarkdownInputPath,
  openWorkspace,
  readMarkdownFile,
  renameMarkdownFile,
  selectWorkspaceFolder
} from "./workspaceService";

/**
 * Runs a best-effort index update without disrupting the file operation.
 *
 * Index drift is recoverable (the cache is rebuildable), so failures are
 * surfaced through the non-blocking index state rather than the workspace error.
 */
async function syncIndex(operation: () => Promise<void>): Promise<void> {
  try {
    await operation();
  } catch (error) {
    useAppStore.getState().setIndexingError(normalizeNativeError(error));
  }
}

export function WorkspaceExplorer() {
  const workspace = useAppStore((state) => state.workspace);
  const setWorkspaceLoading = useAppStore((state) => state.setWorkspaceLoading);
  const setWorkspaceReady = useAppStore((state) => state.setWorkspaceReady);
  const setWorkspaceError = useAppStore((state) => state.setWorkspaceError);
  const setWorkspaceFiles = useAppStore((state) => state.setWorkspaceFiles);
  const setWorkspaceEntries = useAppStore((state) => state.setWorkspaceEntries);
  const [busyPath, setBusyPath] = useState<string | null>(null);

  async function handleOpenWorkspace() {
    try {
      const selectedFolder = await selectWorkspaceFolder();

      if (!selectedFolder) {
        return;
      }

      setWorkspaceLoading();
      const snapshot = await openWorkspace(selectedFolder);
      const entries = await listWorkspaceEntries(snapshot.workspace.rootPath);
      setWorkspaceReady(snapshot.workspace, snapshot.files, entries);
    } catch (error) {
      setWorkspaceError(normalizeNativeError(error));
    }
  }

  async function handleRefresh() {
    if (workspace.status !== "ready") {
      return;
    }

    try {
      const rootPath = workspace.workspace.rootPath;
      const [files, entries] = await Promise.all([
        listMarkdownFiles(rootPath),
        listWorkspaceEntries(rootPath)
      ]);
      setWorkspaceFiles(files);
      setWorkspaceEntries(entries);
    } catch (error) {
      setWorkspaceError(normalizeNativeError(error));
    }
  }

  async function handleCreateNote() {
    if (workspace.status !== "ready") {
      return;
    }

    const requestedPath = window.prompt("New Markdown file path", "Untitled.md");
    const relativePath = normalizeMarkdownInputPath(requestedPath ?? "");

    if (!relativePath) {
      return;
    }

    try {
      setBusyPath(relativePath);
      const created = await createMarkdownFile(
        workspace.workspace.rootPath,
        relativePath
      );
      setWorkspaceFiles(await listMarkdownFiles(workspace.workspace.rootPath));
      setWorkspaceEntries(
        await listWorkspaceEntries(workspace.workspace.rootPath)
      );
      await syncIndex(() =>
        indexDocument(workspace.workspace.rootPath, created, "")
      );
    } catch (error) {
      setWorkspaceError(normalizeNativeError(error));
    } finally {
      setBusyPath(null);
    }
  }

  async function handleOpenNote(file: MarkdownFileEntry) {
    if (workspace.status !== "ready") {
      return;
    }

    const documentFile = {
      rootPath: workspace.workspace.rootPath,
      relativePath: file.relativePath,
      fileName: file.fileName
    };

    try {
      setBusyPath(file.relativePath);
      await openNoteDocument(documentFile);
    } catch (error) {
      useAppStore.getState().setWorkspaceError(normalizeNativeError(error));
    } finally {
      setBusyPath(null);
    }
  }

  async function handleRenameNote(file: MarkdownFileEntry) {
    if (workspace.status !== "ready") {
      return;
    }

    const requestedPath = window.prompt("Rename Markdown file", file.relativePath);
    const newRelativePath = normalizeMarkdownInputPath(requestedPath ?? "");

    if (!newRelativePath || newRelativePath === file.relativePath) {
      return;
    }

    try {
      setBusyPath(file.relativePath);
      const rootPath = workspace.workspace.rootPath;
      const renamed = await renameMarkdownFile(
        rootPath,
        file.relativePath,
        newRelativePath
      );
      setWorkspaceFiles(await listMarkdownFiles(rootPath));
      setWorkspaceEntries(await listWorkspaceEntries(rootPath));
      await syncIndex(async () => {
        await removeIndexedDocument(rootPath, file.relativePath);
        const loaded = await readMarkdownFile(rootPath, renamed.relativePath);
        await indexDocument(rootPath, renamed, loaded.contents);
      });
    } catch (error) {
      setWorkspaceError(normalizeNativeError(error));
    } finally {
      setBusyPath(null);
    }
  }

  async function handleDeleteNote(file: MarkdownFileEntry) {
    if (workspace.status !== "ready") {
      return;
    }

    const confirmed = window.confirm(`Delete ${file.relativePath}?`);

    if (!confirmed) {
      return;
    }

    try {
      setBusyPath(file.relativePath);
      await deleteMarkdownFile(workspace.workspace.rootPath, file.relativePath);
      setWorkspaceFiles(
        workspace.files.filter(
          (candidate) => candidate.relativePath !== file.relativePath
        )
      );
      setWorkspaceEntries(
        await listWorkspaceEntries(workspace.workspace.rootPath)
      );
      await syncIndex(() =>
        removeIndexedDocument(workspace.workspace.rootPath, file.relativePath)
      );
    } catch (error) {
      setWorkspaceError(normalizeNativeError(error));
    } finally {
      setBusyPath(null);
    }
  }

  return (
    <aside className={styles.workspacePanel} aria-labelledby="workspace-title">
      <div className={styles.workspacePanelHeader}>
        <div>
          <p className={styles.appEyebrow}>Explorer</p>
          <h2 id="workspace-title">Workspace</h2>
        </div>
        <Button variant="secondary" onClick={handleOpenWorkspace}>
          Open
        </Button>
      </div>
      <WorkspacePanelBody
        busyPath={busyPath}
        onCreateNote={handleCreateNote}
        onDeleteNote={handleDeleteNote}
        onOpenNote={handleOpenNote}
        onRefresh={handleRefresh}
        onRenameNote={handleRenameNote}
      />
    </aside>
  );
}

function WorkspacePanelBody({
  busyPath,
  onCreateNote,
  onDeleteNote,
  onOpenNote,
  onRefresh,
  onRenameNote
}: {
  readonly busyPath: string | null;
  readonly onCreateNote: () => void;
  readonly onDeleteNote: (file: MarkdownFileEntry) => void;
  readonly onOpenNote: (file: MarkdownFileEntry) => void;
  readonly onRefresh: () => void;
  readonly onRenameNote: (file: MarkdownFileEntry) => void;
}) {
  const workspace = useAppStore((state) => state.workspace);
  const activeDocument = useAppStore((state) => state.activeDocument);
  const entries = workspace.status === "ready" ? workspace.entries : null;
  // Rebuild the nested tree only when the workspace entry list changes.
  const treeNodes = useMemo(
    () => (entries ? buildFileTree(entries) : []),
    [entries]
  );

  if (workspace.status === "idle") {
    return (
      <p className={styles.workspaceEmpty}>
        Open a folder to list and manage Markdown notes.
      </p>
    );
  }

  if (workspace.status === "loading") {
    return <p className={styles.workspaceEmpty}>Opening workspace...</p>;
  }

  if (workspace.status === "error") {
    return (
      <div className={styles.workspaceError} role="status">
        <strong>{workspace.error.code}</strong>
        <span>{workspace.error.message}</span>
      </div>
    );
  }

  return (
    <>
      <div className={styles.workspaceMeta}>
        <strong>{workspace.workspace.name}</strong>
        <span>{workspace.workspace.rootPath}</span>
      </div>
      <div className={styles.workspaceActions}>
        <Button onClick={onCreateNote}>New note</Button>
        <Button variant="secondary" onClick={onRefresh}>
          Refresh
        </Button>
      </div>
      {treeNodes.length === 0 ? (
        <p className={styles.workspaceEmpty}>This folder is empty.</p>
      ) : (
        <FileTree
          activeRelativePath={
            activeDocument.file?.rootPath === workspace.workspace.rootPath
              ? activeDocument.file.relativePath
              : null
          }
          busyPath={busyPath}
          nodes={treeNodes}
          onDeleteNote={onDeleteNote}
          onOpenNote={onOpenNote}
          onRenameNote={onRenameNote}
        />
      )}
    </>
  );
}
