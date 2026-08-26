import { invoke } from "@tauri-apps/api/core";

import type {
  ConflictComparison as NativeConflictComparison,
  ConflictResolution as NativeConflictResolution,
  ConflictResolved as NativeConflictResolved,
  ConflictSummary as NativeConflictSummary
} from "../sync/conflictTypes";
import type {
  ConflictRate as NativeConflictRate,
  HistoryCleanup as NativeHistoryCleanup,
  HistoryUsage as NativeHistoryUsage,
  RecordedChange as NativeRecordedChange,
  SavedSignIn as NativeSavedSignIn,
  SignInStatus as NativeSignInStatus,
  Synced as NativeSynced,
  SyncStatus as NativeSyncStatus
} from "../sync/historyTypes";

export interface NativeCommandErrorShape {
  readonly code: string;
  readonly message: string;
  readonly details?: string;
}

export class NativeCommandError extends Error {
  readonly code: string;
  readonly details?: string;

  constructor({ code, message, details }: NativeCommandErrorShape) {
    super(message);
    this.name = "NativeCommandError";
    this.code = code;
    this.details = details;
  }
}

/** Rust-shaped status returned by the `desktop_shell_status` IPC command. */
interface NativeShellStatus {
  readonly app_name: string;
  readonly shell_version: string;
  readonly ready: boolean;
}

export interface NativeCommandMap {
  readonly desktop_shell_status: {
    readonly args: undefined;
    readonly result: NativeShellStatus;
  };
  readonly workspace_access_capabilities: {
    readonly args: undefined;
    readonly result: NativeWorkspaceAccessCapabilities;
  };
  readonly list_managed_workspaces: {
    readonly args: undefined;
    readonly result: readonly NativeWorkspaceDescriptor[];
  };
  readonly create_managed_workspace: {
    readonly args: { readonly name: string };
    readonly result: NativeWorkspaceDescriptor;
  };
  readonly open_workspace: {
    readonly args: { readonly rootPath: string };
    readonly result: NativeWorkspaceSnapshot;
  };
  readonly open_workspace_window: { readonly args: { readonly rootPath: string }; readonly result: null };
  readonly window_workspace_root: { readonly args: undefined; readonly result: string | null };
  readonly list_markdown_files: {
    readonly args: { readonly rootPath: string };
    readonly result: readonly NativeMarkdownFileEntry[];
  };
  readonly list_workspace_entries: {
    readonly args: { readonly rootPath: string; readonly includeHidden: boolean };
    readonly result: readonly NativeWorkspaceEntry[];
  };
  readonly quarantined_settings: {
    readonly args: undefined;
    readonly result: readonly string[];
  };
  readonly list_note_versions: {
    readonly args: { readonly rootPath: string; readonly relativePath: string };
    readonly result: readonly NativeKeptVersion[];
  };
  readonly restore_note_backup: {
    readonly args: {
      readonly rootPath: string;
      readonly relativePath: string;
      readonly versionPath: string;
    };
    readonly result: null;
  };
  readonly read_markdown_file: {
    readonly args: {
      readonly rootPath: string;
      readonly relativePath: string;
    };
    readonly result: NativeMarkdownFileContents;
  };
  readonly write_markdown_file: {
    readonly args: {
      readonly rootPath: string;
      readonly relativePath: string;
      readonly contents: string;
      readonly expected?: string;
    };
    readonly result: NativeMarkdownFileEntry;
  };
  readonly create_markdown_file: {
    readonly args: {
      readonly rootPath: string;
      readonly relativePath: string;
      readonly contents?: string;
    };
    readonly result: NativeMarkdownFileEntry;
  };
  readonly rename_markdown_file: {
    readonly args: {
      readonly rootPath: string;
      readonly relativePath: string;
      readonly newRelativePath: string;
    };
    readonly result: NativeMarkdownFileEntry;
  };
  readonly delete_markdown_file: {
    readonly args: {
      readonly rootPath: string;
      readonly relativePath: string;
    };
    readonly result: null;
  };
  readonly create_workspace_file: {
    readonly args: {
      readonly rootPath: string;
      readonly relativePath: string;
      readonly contents?: string;
    };
    readonly result: NativeWorkspaceEntry;
  };
  readonly create_workspace_folder: {
    readonly args: {
      readonly rootPath: string;
      readonly relativePath: string;
    };
    readonly result: NativeWorkspaceEntry;
  };
  readonly rename_workspace_entry: {
    readonly args: {
      readonly rootPath: string;
      readonly relativePath: string;
      readonly newRelativePath: string;
    };
    readonly result: NativeWorkspaceEntry;
  };
  readonly delete_workspace_entry: {
    readonly args: {
      readonly rootPath: string;
      readonly relativePath: string;
    };
    readonly result: null;
  };
  readonly index_documents: {
    readonly args: {
      readonly rootPath: string;
      readonly documents: readonly NativeDocumentInput[];
    };
    readonly result: number;
  };
  readonly search_index: {
    readonly args: {
      readonly rootPath: string;
      readonly query: string;
      /** Workspace-relative folder to search inside. Absent searches the vault. */
      readonly pathPrefix?: string;
      readonly limit?: number;
    };
    readonly result: readonly NativeSearchHit[];
  };
  readonly query_index_metadata: {
    readonly args: {
      readonly rootPath: string;
      readonly pathPrefix: string;
      readonly facetKeys: readonly string[];
      readonly predicates: readonly NativeMetadataPredicate[];
    };
    readonly result: NativeMetadataQueryResult;
  };
  readonly clear_index: {
    readonly args: { readonly rootPath: string };
    readonly result: null;
  };
  readonly remove_index_document: {
    readonly args: {
      readonly rootPath: string;
      readonly path: string;
    };
    readonly result: null;
  };
  /** Starts watching a workspace; resolves with the canonical root events carry. */
  readonly watch_workspace: {
    readonly args: { readonly rootPath: string };
    readonly result: string;
  };
  /** Releases one watch request; takes the canonical root `watch_workspace` returned. */
  readonly unwatch_workspace: {
    readonly args: { readonly canonicalRoot: string };
    readonly result: null;
  };
  readonly list_conflicts: {
    readonly args: { readonly rootPath: string };
    readonly result: readonly NativeConflictSummary[];
  };
  /** `buffer` carries an open editor's unsaved text as this computer's side. */
  readonly read_conflict: {
    readonly args: {
      readonly rootPath: string;
      readonly copyPath: string;
      readonly buffer?: string | null;
    };
    readonly result: NativeConflictComparison;
  };
  /**
   * `expectedOurs`/`expectedTheirs` are the fingerprints the decision was made
   * from; the write is refused if either side has moved since.
   */
  readonly resolve_conflict: {
    readonly args: {
      readonly rootPath: string;
      readonly copyPath: string;
      readonly resolution: NativeConflictResolution;
      readonly expectedOurs: string;
      readonly expectedTheirs: string;
    };
    readonly result: NativeConflictResolved;
  };
  /** What the status footer says: health, counts and when it last saved. */
  readonly sync_status: {
    readonly args: { readonly rootPath: string };
    readonly result: NativeSyncStatus;
  };
  /** `notePath` narrows the list to one note's restorable versions. */
  readonly sync_history: {
    readonly args: {
      readonly rootPath: string;
      readonly notePath: string | null;
      readonly limit: number;
    };
    readonly result: readonly NativeRecordedChange[];
  };
  /** Puts one note back to the version recorded in `change`. */
  readonly restore_version: {
    readonly args: {
      readonly rootPath: string;
      readonly notePath: string;
      readonly change: string;
    };
    readonly result: null;
  };
  readonly sync_conflict_rate: {
    readonly args: { readonly rootPath: string };
    readonly result: NativeConflictRate;
  };
  /** One round trip to wherever this workspace syncs to. */
  readonly sync_now: {
    readonly args: { readonly rootPath: string };
    readonly result: NativeSynced;
  };
  /** Saves a username and access token in the OS keychain, never settings. */
  readonly save_sync_credentials: {
    readonly args: {
      readonly rootPath: string;
      readonly destination: string;
      readonly username: string;
      readonly token: string;
      readonly profileId?: string | null;
      readonly label?: string | null;
    };
    readonly result: NativeSavedSignIn;
  };
  readonly save_sync_link: {
    readonly args: {
      readonly rootPath: string;
      readonly destination: string;
      readonly profileId?: string | null;
    };
    readonly result: NativeSavedSignIn;
  };
  readonly sync_sign_in_status: {
    readonly args: {
      readonly rootPath: string;
      readonly destination: string;
      readonly profileId?: string | null;
    };
    readonly result: NativeSignInStatus;
  };
  readonly forget_sync_sign_in: {
    readonly args: { readonly profileId: string };
    readonly result: null;
  };
  readonly preview_workspace_from_git_link: {
    readonly args: { readonly destination: string; readonly parentPath: string };
    readonly result: NativeGitLinkPreview;
  };
  readonly preview_managed_workspace_from_git_link: {
    readonly args: { readonly destination: string };
    readonly result: NativeGitLinkPreview;
  };
  readonly import_workspace_from_git_link: {
    readonly args: {
      readonly destination: string;
      readonly parentPath: string;
      readonly profileId?: string | null;
    };
    readonly result: NativeImportStarted;
  };
  readonly import_managed_workspace_from_git_link: {
    readonly args: {
      readonly destination: string;
      readonly profileId?: string | null;
    };
    readonly result: NativeImportStarted;
  };
  readonly sync_history_usage: {
    readonly args: { readonly rootPath: string };
    readonly result: NativeHistoryUsage;
  };
  readonly sync_free_space: {
    readonly args: { readonly rootPath: string };
    readonly result: NativeHistoryCleanup;
  };
  readonly sync_clear_undo_history: {
    readonly args: { readonly rootPath: string };
    readonly result: NativeHistoryCleanup;
  };
  readonly read_app_settings: {
    readonly args: undefined;
    readonly result: string | null;
  };
  readonly write_app_settings: {
    readonly args: {
      readonly contents: string;
      /**
       * The document this write was computed from — `null` when the file was
       * absent. The host writes only if that is still what is on disk, so a
       * `desktopState` write racing this save cannot be reverted by it. See
       * `settings/appSettingsFile.ts`.
       */
      readonly expected: string | null;
    };
    readonly result: null;
  };
  readonly update_desktop_state: {
    readonly args: { readonly update: NativeDesktopStateUpdate };
    readonly result: string;
  };
  // Resolves to the full serialized settings document written by the host.
  readonly update_app_theme: {
    readonly args: { readonly theme: string };
    readonly result: string;
  };
  readonly read_workspace_settings: {
    readonly args: { readonly rootPath: string };
    readonly result: string | null;
  };
  readonly write_workspace_settings: {
    readonly args: {
      readonly rootPath: string;
      readonly contents: string;
      /**
       * The document this write was computed from — `null` when the file was
       * absent. The host writes only if that is still what is on disk, so a
       * second window cannot lose the first one's keys. See
       * `workspace/workspaceSettingsFile.ts`.
       */
      readonly expected: string | null;
    };
    readonly result: null;
  };
  // Lists every .tbtheme.json file discovered in the app-data themes directory.
  // Each entry carries the theme's display name (parsed from the JSON `name`
  // field, falling back to the filename stem) and its absolute filesystem path.
  readonly list_themes: {
    readonly args: undefined;
    readonly result: readonly NativeThemeEntry[];
  };
  // Reads the contents of a single `.tbtheme.json` file at an absolute path.
  // Bypasses the Tauri FS plugin's scope (which excludes the app-data dir) by
  // using `std::fs` directly on the Rust side, mirroring `read_app_settings`.
  // Returns `null` when the file does not exist.
  readonly read_theme_file: {
    readonly args: { readonly path: string };
    readonly result: string | null;
  };
  // Reads one file inside a locally loaded extension directory. The Rust side
  // canonicalizes both paths and rejects anything resolving outside the
  // directory, including an escaping symlink.
  readonly read_extension_file: {
    readonly args: { readonly directory: string; readonly relativePath: string };
    readonly result: string;
  };
}

export type NativeCommandName = keyof NativeCommandMap;

export interface NativeWorkspaceDescriptor {
  readonly root_path: string;
  readonly name: string;
}

export interface NativeWorkspaceAccessCapabilities {
  readonly canOpenFolder: boolean;
  readonly canCreateManagedWorkspace: boolean;
  readonly opensWorkspaceInNewWindow: boolean;
}

export interface NativeDesktopStateUpdate {
  readonly lastWorkspacePath?: string | null;
  readonly recentWorkspacePaths?: readonly string[];
  readonly explorerOpen?: boolean;
  readonly leftPanelWidth?: number;
  readonly rightPanelWidth?: number;
  readonly bottomPanelOpen?: boolean;
  readonly developmentExtensionDirectories?: readonly string[];
  readonly openTabs?: readonly NativePersistedTab[];
  readonly activeTabId?: string | null;
  /** Mirrors `settings::CollapsedGroupsUpdate` on the Rust side (D53). */
  readonly collapsedGroups?: {
    readonly workspacePath: string;
    readonly viewId: string;
    readonly collapsed: readonly string[];
  };
}

/** Mirrors `settings::PersistedTab` on the Rust side (settings.rs). */
export interface NativePersistedTab {
  readonly id: string;
  readonly title: string;
  readonly kind: string;
  readonly rootPath?: string;
  readonly relativePath?: string;
}

export interface NativeMarkdownFileEntry {
  readonly relative_path: string;
  readonly file_name: string;
  readonly parent_path: string;
  readonly byte_size: number;
  readonly updated_at: string | null;
}

/** One version of a note the app kept before replacing it. */
export interface NativeKeptVersion {
  /** Absolute path, sent back verbatim to restore this one. */
  readonly path: string;
  /** Milliseconds since the epoch. */
  readonly keptAt: number;
  readonly byteSize: number;
}

export interface NativeMarkdownFileContents {
  readonly relative_path: string;
  readonly contents: string;
}

export interface NativeWorkspaceEntry {
  readonly relative_path: string;
  readonly name: string;
  readonly parent_path: string;
  readonly kind: "directory" | "file";
  readonly is_markdown: boolean;
  readonly byte_size: number;
  readonly updated_at: number | null;
}

export interface NativeWorkspaceSnapshot {
  readonly workspace: NativeWorkspaceDescriptor;
  readonly files: readonly NativeMarkdownFileEntry[];
}

/**
 * One discovered `.tbtheme.json` theme file, returned by the `list_themes`
 * native command. The `name` is parsed from the JSON `name` field (falling
 * back to the filename stem when the file is unparseable); `path` is the
 * absolute filesystem path to the file.
 */
export interface NativeThemeEntry {
  readonly name: string;
  readonly path: string;
}

export interface NativeGitLinkPreview {
  readonly childName: string;
  readonly targetPath: string;
}

export interface NativeImportStarted {
  readonly requestId: string;
  readonly targetPath: string;
}

export interface NativeImportProgress {
  readonly requestId: string;
  readonly state: string;
  readonly phase?: NativeSyncStatus["phase"];
  readonly targetPath: string;
  readonly error?: NativeCommandErrorShape;
}

// Sent to `index_documents`. Field names are camelCase here and mapped to the
// Rust struct's snake_case fields by serde's `rename_all = "camelCase"`.
export interface NativeDocumentInput {
  readonly path: string;
  readonly fileName: string;
  readonly title?: string;
  readonly tags: readonly string[];
  readonly aliases: readonly string[];
  readonly body: string;
  readonly metadata: readonly NativeMetadataField[];
}

export interface NativeSearchHit {
  readonly path: string;
  readonly file_name: string;
  readonly title?: string;
  readonly snippet: string;
  readonly score: number;
}

export type NativeMetadataValue = string | number;

export interface NativeMetadataField {
  readonly key: string;
  readonly values: readonly NativeMetadataValue[];
}

export interface NativeMetadataPredicate {
  readonly key: string;
  readonly value: NativeMetadataValue;
}

export interface NativeMetadataFacet {
  readonly key: string;
  readonly values: readonly NativeMetadataValue[];
}

export interface NativeMetadataQueryResult {
  readonly facets: readonly NativeMetadataFacet[];
  readonly matching_paths: readonly string[];
}

export async function invokeNativeCommand<TCommand extends NativeCommandName>(
  ...[command, args]: NativeCommandMap[TCommand]["args"] extends undefined
    ? [command: TCommand]
    : [command: TCommand, args: NativeCommandMap[TCommand]["args"]]
): Promise<NativeCommandMap[TCommand]["result"]> {
  try {
    return await invoke<NativeCommandMap[TCommand]["result"]>(
      command,
      args as (NativeCommandMap[TCommand]["args"] & Record<string, unknown>) | undefined
    );
  } catch (error) {
    throw normalizeNativeError(error);
  }
}

export function normalizeNativeError(error: unknown): NativeCommandError {
  if (error instanceof NativeCommandError) {
    return error;
  }

  if (isNativeErrorShape(error)) {
    return new NativeCommandError(error);
  }

  return new NativeCommandError({
    code: "desktop.native_bridge_error",
    message:
      error instanceof Error
        ? error.message
        : typeof error === "string"
          ? error
          : "The desktop native bridge returned an unknown error."
  });
}

function isNativeErrorShape(error: unknown): error is NativeCommandErrorShape {
  if (!error || typeof error !== "object") {
    return false;
  }

  const candidate = error as Record<string, unknown>;

  return (
    typeof candidate.code === "string" &&
    typeof candidate.message === "string" &&
    (candidate.details === undefined || typeof candidate.details === "string")
  );
}
