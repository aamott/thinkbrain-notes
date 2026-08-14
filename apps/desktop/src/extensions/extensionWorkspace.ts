/**
 * The notes API an extension uses to read, write, create, and open notes.
 *
 * This is the surface that makes an extension useful: without it a command can
 * only toggle chrome. Every path is workspace-relative and validated here, so a
 * mistake names the offending path rather than surfacing as an opaque native
 * error. The Rust side validates independently — this does not replace it.
 *
 * Nothing here is a privilege boundary. A loaded extension is trusted code with
 * full application privileges; these checks catch bugs, not adversaries.
 */

import type { WorkspaceDesktopApi } from "../workspace/workspaceAdapter";
import type { WorkspaceDocumentApi } from "../workspace/workspaceDocumentAdapter";
import type { WorkspaceBridge } from "./workspaceBridge";

/** A note found by {@link DesktopExtensionWorkspace.listNotes}. */
export interface ExtensionNote {
  readonly relativePath: string;
  /** Last modified time, or `null` when the platform did not report one. */
  readonly updatedAt: number | null;
}

/** Workspace operations exposed to one extension. */
export interface DesktopExtensionWorkspace {
  /** Current workspace root, or `null` when no workspace is open. */
  rootPath(): string | null;
  /** Reads a note's Markdown contents. */
  readNote(relativePath: string): Promise<string>;
  /** Overwrites a note's Markdown contents. */
  writeNote(relativePath: string, contents: string): Promise<void>;
  /** Creates a note, failing if one already exists at that path. */
  createNote(relativePath: string, contents?: string): Promise<void>;
  /** Opens a note in an editor tab. */
  openNote(relativePath: string): Promise<void>;
  /** Renames or moves a note within the workspace. */
  renameNote(relativePath: string, newRelativePath: string): Promise<void>;
  /** Deletes a note from the workspace (permanently). */
  deleteNote(relativePath: string): Promise<void>;
  /**
   * Lists Markdown notes, optionally within one folder.
   *
   * @param prefix Workspace-relative folder to list, or omitted for the whole
   *   workspace. Matched as a folder, so `"journal"` excludes `journalish/`.
   */
  listNotes(prefix?: string): Promise<readonly ExtensionNote[]>;
}

export interface ExtensionWorkspaceOptions {
  readonly documents: WorkspaceDocumentApi;
  readonly getBridge: () => WorkspaceBridge | null;
  readonly entries: Pick<WorkspaceDesktopApi, "listWorkspaceEntries" | "renameWorkspaceEntry" | "deleteWorkspaceEntry">;
}

const WINDOWS_ABSOLUTE = /^[A-Za-z]:[\\/]/;

/** Rejects anything that is not a path inside the workspace. */
function assertRelativePath(relativePath: string): void {
  if (typeof relativePath !== "string" || relativePath.trim().length === 0) {
    throw new Error("A note path must be a non-empty workspace-relative path.");
  }
  if (
    relativePath.startsWith("/") ||
    relativePath.startsWith("\\") ||
    WINDOWS_ABSOLUTE.test(relativePath)
  ) {
    throw new Error(`Note path "${relativePath}" must be relative to the workspace.`);
  }
  if (relativePath.split(/[\\/]/).includes("..")) {
    throw new Error(`Note path "${relativePath}" must stay inside the workspace.`);
  }
}

export function createExtensionWorkspace(
  options: ExtensionWorkspaceOptions
): DesktopExtensionWorkspace {
  const { documents, getBridge, entries } = options;

  /** Resolves the shell surface, failing before the shell has mounted. */
  const bridge = (): WorkspaceBridge => {
    const current = getBridge();
    if (!current) {
      throw new Error("The workspace is not ready yet.");
    }
    return current;
  };

  /** Validates a path and resolves the root it is relative to. */
  const resolve = (relativePath: string): string => {
    assertRelativePath(relativePath);
    const root = getBridge()?.rootPath ?? null;
    if (!root) {
      throw new Error("No workspace is open.");
    }
    return root;
  };

  return {
    rootPath: () => getBridge()?.rootPath ?? null,

    readNote: async (relativePath) => {
      const rootPath = resolve(relativePath);
      const file = await documents.readMarkdownDocument({ rootPath, relativePath });
      return file.contents;
    },

    writeNote: async (relativePath, contents) => {
      const rootPath = resolve(relativePath);
      // Unchecked: an extension writing a note has not read it through anything
      // that tracks what disk held, so it has nothing to expect. Giving these
      // writes a precondition of their own is a separate question from the one
      // the editor's saves answer.
      await documents.writeMarkdownDocument({ rootPath, relativePath, contents, expected: undefined });
    },

    createNote: async (relativePath, contents) => {
      const rootPath = resolve(relativePath);
      await documents.createMarkdownDocument({ rootPath, relativePath, contents });
    },

    openNote: async (relativePath) => {
      assertRelativePath(relativePath);
      bridge().openNote(relativePath);
    },

    renameNote: async (relativePath, newRelativePath) => {
      const rootPath = resolve(relativePath);
      assertRelativePath(newRelativePath);
      await entries.renameWorkspaceEntry(rootPath, relativePath, newRelativePath);
    },

    deleteNote: async (relativePath) => {
      const rootPath = resolve(relativePath);
      await entries.deleteWorkspaceEntry(rootPath, relativePath);
    },

    listNotes: async (prefix) => {
      const root = getBridge()?.rootPath ?? null;
      if (!root) throw new Error("No workspace is open.");

      // A folder prefix, not a string prefix: asking for "journal" must not
      // return "journalish/notes.md".
      let folder = "";
      if (prefix !== undefined && prefix.trim() !== "") {
        assertRelativePath(prefix);
        folder = prefix.endsWith("/") ? prefix : `${prefix}/`;
      }

      const found = await entries.listWorkspaceEntries(root, false);
      return found
        .filter(
          (entry) =>
            entry.kind === "file" &&
            entry.is_markdown &&
            entry.relative_path.startsWith(folder)
        )
        .map((entry) => ({
          relativePath: entry.relative_path,
          updatedAt: entry.updated_at ?? null
        }));
    }
  };
}
