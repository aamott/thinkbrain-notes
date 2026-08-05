import { open } from "@tauri-apps/plugin-dialog";
import {
  invokeNativeCommand,
  type NativeWorkspaceEntry,
  type NativeWorkspaceSnapshot
} from "../native/commands";

export interface WorkspaceDesktopApi {
  pickWorkspaceDirectory(): Promise<string | null>;
  openWorkspace(rootPath: string): Promise<NativeWorkspaceSnapshot>;
  listWorkspaceEntries(rootPath: string, includeHidden: boolean): Promise<readonly NativeWorkspaceEntry[]>;
  openWorkspaceWindow(rootPath: string): Promise<void>;
  windowWorkspaceRoot(): Promise<string | null>;
  /** Creates a workspace file (any extension) and missing parent folders. */
  createWorkspaceFile(
    rootPath: string,
    relativePath: string,
    contents?: string
  ): Promise<NativeWorkspaceEntry>;
  /** Creates a workspace folder (and any missing parents). */
  createWorkspaceFolder(rootPath: string, relativePath: string): Promise<NativeWorkspaceEntry>;
  /** Renames or moves any workspace file or folder. */
  renameWorkspaceEntry(
    rootPath: string,
    relativePath: string,
    newRelativePath: string
  ): Promise<NativeWorkspaceEntry>;
  /** Deletes any workspace file or folder (folders are removed recursively). */
  deleteWorkspaceEntry(rootPath: string, relativePath: string): Promise<null>;
}

export const workspaceDesktopApi: WorkspaceDesktopApi = {
  async pickWorkspaceDirectory() {
    const selection = await open({
      title: "Open workspace",
      directory: true,
      multiple: false
    });

    return typeof selection === "string" ? selection : null;
  },
  openWorkspace(rootPath) {
    return invokeNativeCommand("open_workspace", { rootPath });
  },
  listWorkspaceEntries(rootPath, includeHidden) {
    return invokeNativeCommand("list_workspace_entries", { rootPath, includeHidden });
  },
  openWorkspaceWindow(rootPath) {
    return invokeNativeCommand("open_workspace_window", { rootPath }).then(() => undefined);
  },
  windowWorkspaceRoot() {
    return invokeNativeCommand("window_workspace_root");
  },
  createWorkspaceFile(rootPath, relativePath, contents) {
    return invokeNativeCommand("create_workspace_file", { rootPath, relativePath, contents });
  },
  createWorkspaceFolder(rootPath, relativePath) {
    return invokeNativeCommand("create_workspace_folder", { rootPath, relativePath });
  },
  renameWorkspaceEntry(rootPath, relativePath, newRelativePath) {
    return invokeNativeCommand("rename_workspace_entry", { rootPath, relativePath, newRelativePath });
  },
  deleteWorkspaceEntry(rootPath, relativePath) {
    return invokeNativeCommand("delete_workspace_entry", { rootPath, relativePath });
  }
};
