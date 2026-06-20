import { create } from "zustand";
import type { MarkdownFileEntry, WorkspaceDescriptor } from "@thinkbrain/core";

import type { NativeCommandErrorShape, ShellStatus } from "../native/commands";

export type NativeShellState =
  | { readonly status: "idle" }
  | { readonly status: "checking" }
  | { readonly status: "ready"; readonly shell: ShellStatus }
  | { readonly status: "error"; readonly error: NativeCommandErrorShape };

export type WorkspaceState =
  | { readonly status: "idle" }
  | { readonly status: "loading" }
  | {
      readonly status: "ready";
      readonly workspace: WorkspaceDescriptor;
      readonly files: readonly MarkdownFileEntry[];
    }
  | { readonly status: "error"; readonly error: NativeCommandErrorShape };

export interface AppStoreState {
  readonly bootChecks: number;
  readonly nativeShell: NativeShellState;
  readonly workspace: WorkspaceState;
  readonly recordBootCheck: () => void;
  readonly resetBootChecks: () => void;
  readonly setNativeShellChecking: () => void;
  readonly setNativeShellReady: (shell: ShellStatus) => void;
  readonly setNativeShellError: (error: NativeCommandErrorShape) => void;
  readonly setWorkspaceLoading: () => void;
  readonly setWorkspaceReady: (
    workspace: WorkspaceDescriptor,
    files: readonly MarkdownFileEntry[]
  ) => void;
  readonly setWorkspaceError: (error: NativeCommandErrorShape) => void;
  readonly setWorkspaceFiles: (files: readonly MarkdownFileEntry[]) => void;
}

export const useAppStore = create<AppStoreState>((set) => ({
  bootChecks: 0,
  nativeShell: { status: "idle" },
  workspace: { status: "idle" },
  recordBootCheck: () =>
    set((state) => ({ bootChecks: state.bootChecks + 1 })),
  resetBootChecks: () => set({ bootChecks: 0 }),
  setNativeShellChecking: () => set({ nativeShell: { status: "checking" } }),
  setNativeShellReady: (shell) =>
    set({ nativeShell: { status: "ready", shell } }),
  setNativeShellError: (error) =>
    set({ nativeShell: { status: "error", error } }),
  setWorkspaceLoading: () => set({ workspace: { status: "loading" } }),
  setWorkspaceReady: (workspace, files) =>
    set({ workspace: { status: "ready", workspace, files } }),
  setWorkspaceError: (error) =>
    set({ workspace: { status: "error", error } }),
  setWorkspaceFiles: (files) =>
    set((state) =>
      state.workspace.status === "ready"
        ? {
            workspace: {
              ...state.workspace,
              files
            }
          }
        : state
    )
}));
