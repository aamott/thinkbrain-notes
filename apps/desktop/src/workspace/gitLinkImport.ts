/**
 * Native bridge for bringing a new notes folder in from a git link.
 *
 * The dialog owns matching on request ID. Success opens a window natively so
 * closing this one cannot lose a finished import.
 */

import {
  invokeNativeCommand,
  type NativeGitLinkPreview,
  type NativeImportProgress,
  type NativeImportStarted
} from "../native/commands";
import { subscribeToNativeEvent } from "../native/events";

const WORKSPACE_IMPORT_EVENT = "sync://import";

export type GitLinkPreview = NativeGitLinkPreview;
export type ImportStarted = NativeImportStarted;
export type WorkspaceImportProgress = NativeImportProgress;

export function previewWorkspaceFromGitLink(
  destination: string,
  parentPath: string
): Promise<GitLinkPreview> {
  return invokeNativeCommand("preview_workspace_from_git_link", { destination, parentPath });
}

export function previewManagedWorkspaceFromGitLink(
  destination: string
): Promise<GitLinkPreview> {
  return invokeNativeCommand("preview_managed_workspace_from_git_link", { destination });
}

export function importWorkspaceFromGitLink(
  destination: string,
  parentPath: string,
  profileId?: string | null
): Promise<ImportStarted> {
  return invokeNativeCommand("import_workspace_from_git_link", {
    destination,
    parentPath,
    profileId: profileId ?? null
  });
}

export function importManagedWorkspaceFromGitLink(
  destination: string,
  profileId?: string | null
): Promise<ImportStarted> {
  return invokeNativeCommand("import_managed_workspace_from_git_link", {
    destination,
    profileId: profileId ?? null
  });
}

export async function subscribeToWorkspaceImport(
  onEvent: (payload: WorkspaceImportProgress) => void
): Promise<() => void> {
  return subscribeToNativeEvent(WORKSPACE_IMPORT_EVENT, onEvent);
}
