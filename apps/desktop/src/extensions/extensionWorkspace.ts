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
import { WINDOWS_ABSOLUTE } from "@thinkbrain/core";

/**
 * Matches a Windows drive-relative path, e.g. `C:file` — not absolute (no
 * separator after the colon, so `WINDOWS_ABSOLUTE` misses it), but on Windows
 * it still parses as a drive `Prefix` component the native normalizer rejects
 * as an escape.
 */
const WINDOWS_DRIVE_RELATIVE = /^[A-Za-z]:(?!\/)/;

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

/**
 * Rejects anything that is not a path inside the workspace.
 *
 * Mirrors the native normalizer (`normalize_relative_path_parts`): separators
 * are unified first, `.` segments and repeated separators collapse to nothing,
 * a whitespace-only segment is rejected, `..` escapes, and a drive-letter
 * prefix — absolute *or* drive-relative — is not a relative path.
 */
function assertRelativePath(relativePath: string): void {
  if (typeof relativePath !== "string" || relativePath.trim().length === 0) {
    throw new Error("A note path must be a non-empty workspace-relative path.");
  }
  const normalized = relativePath.replace(/\\/g, "/");
  if (
    normalized.startsWith("/") ||
    WINDOWS_ABSOLUTE.test(normalized) ||
    WINDOWS_DRIVE_RELATIVE.test(normalized)
  ) {
    throw new Error(`Note path "${relativePath}" must be relative to the workspace.`);
  }
  let hasSegment = false;
  for (const segment of normalized.split("/")) {
    // `Path::components` collapses repeated separators and skips `.`, so the
    // native side accepts `a//b` and `./a`; only a segment that is all
    // whitespace is an `EmptySegment` rejection there.
    if (segment === "" || segment === ".") continue;
    if (segment === "..") {
      throw new Error(`Note path "${relativePath}" must stay inside the workspace.`);
    }
    if (segment.trim().length === 0) {
      throw new Error(`Note path "${relativePath}" contains an empty segment.`);
    }
    hasSegment = true;
  }
  if (!hasSegment) {
    throw new Error("A note path must be a non-empty workspace-relative path.");
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
    // `bridge()` first so "shell not mounted" stays distinguishable from "no
    // workspace open" here, as it already is for `openNote` and `tabs.open`.
    const root = bridge().rootPath;
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
      const current = bridge();
      if (!current.rootPath) {
        throw new Error("No workspace is open.");
      }
      current.openNote(relativePath);
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
      const root = bridge().rootPath;
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
