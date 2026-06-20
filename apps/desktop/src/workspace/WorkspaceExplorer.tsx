import type { MarkdownFileEntry } from "@thinkbrain/core";
import { Button } from "@thinkbrain/ui";
import { useState } from "react";

import { normalizeNativeError } from "../native/commands";
import { useAppStore } from "../stores/appStore";
import {
  createMarkdownFile,
  deleteMarkdownFile,
  listMarkdownFiles,
  normalizeMarkdownInputPath,
  openWorkspace,
  renameMarkdownFile,
  selectWorkspaceFolder
} from "./workspaceService";

export function WorkspaceExplorer() {
  const workspace = useAppStore((state) => state.workspace);
  const setWorkspaceLoading = useAppStore((state) => state.setWorkspaceLoading);
  const setWorkspaceReady = useAppStore((state) => state.setWorkspaceReady);
  const setWorkspaceError = useAppStore((state) => state.setWorkspaceError);
  const setWorkspaceFiles = useAppStore((state) => state.setWorkspaceFiles);
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
      await createMarkdownFile(workspace.workspace.rootPath, relativePath);
      setWorkspaceFiles(await listMarkdownFiles(workspace.workspace.rootPath));
    } catch (error) {
      setWorkspaceError(normalizeNativeError(error));
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
      await renameMarkdownFile(
        workspace.workspace.rootPath,
        file.relativePath,
        newRelativePath
      );
      setWorkspaceFiles(await listMarkdownFiles(workspace.workspace.rootPath));
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
  onRefresh,
  onRenameNote
}: {
  readonly busyPath: string | null;
  readonly onCreateNote: () => void;
  readonly onDeleteNote: (file: MarkdownFileEntry) => void;
  readonly onRefresh: () => void;
  readonly onRenameNote: (file: MarkdownFileEntry) => void;
}) {
  const workspace = useAppStore((state) => state.workspace);

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
        <ul className="file-list" aria-label="Markdown files">
          {workspace.files.map((file) => (
            <li key={file.relativePath} className="file-list__item">
              <button className="file-list__name" type="button">
                <span>{file.fileName}</span>
                <small>{file.parentPath || "."}</small>
              </button>
              <div className="file-list__actions">
                <button
                  disabled={busyPath === file.relativePath}
                  onClick={() => onRenameNote(file)}
                  type="button"
                >
                  Rename
                </button>
                <button
                  disabled={busyPath === file.relativePath}
                  onClick={() => onDeleteNote(file)}
                  type="button"
                >
                  Delete
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
