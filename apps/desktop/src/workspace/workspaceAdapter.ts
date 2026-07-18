import { open } from "@tauri-apps/plugin-dialog";
import {
  invokeNativeCommand,
  type NativeWorkspaceEntry,
  type NativeWorkspaceSnapshot
} from "../native/commands";

export interface WorkspaceDesktopApi {
  pickWorkspaceDirectory(): Promise<string | null>;
  openWorkspace(rootPath: string): Promise<NativeWorkspaceSnapshot>;
  listWorkspaceEntries(rootPath: string): Promise<readonly NativeWorkspaceEntry[]>;
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
  listWorkspaceEntries(rootPath) {
    return invokeNativeCommand("list_workspace_entries", { rootPath });
  }
};
