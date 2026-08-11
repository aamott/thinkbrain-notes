import { open } from "@tauri-apps/plugin-dialog";
import {
  invokeNativeCommand,
  type NativeWorkspaceEntry,
  type NativeWorkspaceSnapshot
} from "../native/commands";
import { appEvents } from "../events/appEvents";

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
  // Every workspace load funnels through here — explicit opens and startup
  // restores alike — so this is the one place `workspace.opened` can be
  // emitted without missing a path.
  async openWorkspace(rootPath) {
    const snapshot = await invokeNativeCommand("open_workspace", { rootPath });
    appEvents.emit("workspace.opened", { rootPath });
    return snapshot;
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
  async renameWorkspaceEntry(rootPath, relativePath, newRelativePath) {
    const entry = await invokeNativeCommand("rename_workspace_entry", { rootPath, relativePath, newRelativePath });
    appEvents.emit("note.renamed", { rootPath, oldRelativePath: relativePath, newRelativePath });
    return entry;
  },
  async deleteWorkspaceEntry(rootPath, relativePath) {
    const result = await invokeNativeCommand("delete_workspace_entry", { rootPath, relativePath });
    appEvents.emit("note.deleted", { rootPath, relativePath });
    return result;
  }
};
