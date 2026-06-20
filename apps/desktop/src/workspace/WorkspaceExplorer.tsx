import type { MarkdownFileEntry } from "@thinkbrain/core";
import { Button } from "@thinkbrain/ui";
import { useMemo, useState } from "react";

import { normalizeNativeError } from "../native/commands";
import { indexDocument, removeIndexedDocument } from "../search/searchService";
import { useAppStore } from "../stores/appStore";
import { FileTree } from "./FileTree";
import { buildFileTree } from "./fileTreeModel";
import {
  createMarkdownFile,
  deleteMarkdownFile,
  listMarkdownFiles,
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
  const openActiveDocument = useAppStore((state) => state.openActiveDocument);
  const setActiveDocumentLoaded = useAppStore(
    (state) => state.setActiveDocumentLoaded
  );
  const setActiveDocumentError = useAppStore(
    (state) => state.setActiveDocumentError
  );
  const [busyPath, setBusyPath] = useState<string | null>(null);

  async function handleOpenWorkspace() {
    try {
      const selectedFolder = await selectWorkspaceFolder();

      if (!selectedFolder) {
        return;
      }

      setWorkspaceLoading();
      const snapshot = await openWorkspace(selectedFolder);
      setWorkspaceReady(snapshot.workspace, snapshot.files);
    } catch (error) {
      setWorkspaceError(normalizeNativeError(error));
    }
  }

  async function handleRefresh() {
    if (workspace.status !== "ready") {
      return;
    }

    try {
      setWorkspaceFiles(await listMarkdownFiles(workspace.workspace.rootPath));
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
      openActiveDocument(documentFile);
      const loadedFile = await readMarkdownFile(
        documentFile.rootPath,
        documentFile.relativePath
      );

      if (isActiveDocument(documentFile)) {
        setActiveDocumentLoaded(loadedFile.contents);
      }
    } catch (error) {
      if (isActiveDocument(documentFile)) {
        setActiveDocumentError(normalizeNativeError(error));
      }
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
    <aside className="workspace-panel" aria-labelledby="workspace-title">
      <div className="workspace-panel__header">
        <div>
          <p className="app-eyebrow">Explorer</p>
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
  const files = workspace.status === "ready" ? workspace.files : null;
  // Rebuild the nested tree only when the flat file list changes.
  const treeNodes = useMemo(
    () => (files ? buildFileTree(files) : []),
    [files]
  );

  if (workspace.status === "idle") {
    return (
      <p className="workspace-empty">
        Open a folder to list and manage Markdown notes.
      </p>
    );
  }

  if (workspace.status === "loading") {
    return <p className="workspace-empty">Opening workspace...</p>;
  }

  if (workspace.status === "error") {
    return (
      <div className="workspace-error" role="status">
        <strong>{workspace.error.code}</strong>
        <span>{workspace.error.message}</span>
      </div>
    );
  }

  return (
    <>
      <div className="workspace-meta">
        <strong>{workspace.workspace.name}</strong>
        <span>{workspace.workspace.rootPath}</span>
      </div>
      <div className="workspace-actions">
        <Button onClick={onCreateNote}>New note</Button>
        <Button variant="secondary" onClick={onRefresh}>
          Refresh
        </Button>
      </div>
      {workspace.files.length === 0 ? (
        <p className="workspace-empty">No Markdown files found.</p>
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

function isActiveDocument(file: {
  readonly rootPath: string;
  readonly relativePath: string;
}): boolean {
  const activeFile = useAppStore.getState().activeDocument.file;

  return (
    activeFile?.rootPath === file.rootPath &&
    activeFile.relativePath === file.relativePath
  );
}
