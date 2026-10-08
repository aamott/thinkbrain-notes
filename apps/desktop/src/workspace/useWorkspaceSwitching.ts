import { useCallback, useEffect, useMemo, useState, type Dispatch, type RefObject, type SetStateAction } from "react";
import type { NativeKnownWorkspace, NativeWorkspaceAccessCapabilities } from "../native/commands";
import { useNotificationStore } from "../notifications/notificationStore";
import { forgetWorkspace, saveDesktopState } from "../settings/desktopState";
import { workspaceErrorMessage } from "./workspaceExplorerModel";
import type { WorkspaceDesktopApi } from "./workspaceAdapter";

const DESKTOP_WORKSPACE_ACCESS: NativeWorkspaceAccessCapabilities = {
  canOpenFolder: true,
  canCreateManagedWorkspace: false,
  opensWorkspaceInNewWindow: true
};

/**
 * Everything about choosing, creating, importing and managing workspaces — as
 * opposed to exploring the one that is open. Owned by `WorkspaceExplorer`,
 * rendered by `WorkspaceSwitching`, the workspace selector and the manager
 * dialog.
 */
export interface WorkspaceSwitchingController {
  readonly accessCapabilities: NativeWorkspaceAccessCapabilities | null;
  /**
   * Every workspace the app knows about — recents in recency order, then
   * managed vaults — including entries whose folder is currently missing.
   */
  readonly knownWorkspaces: readonly NativeKnownWorkspace[];
  readonly createManagedWorkspaceOpen: boolean;
  readonly managedStorageNoticeOpen: boolean;
  readonly importFromGitOpen: boolean;
  readonly manageWorkspacesOpen: boolean;
  /** A failure belonging to the manager dialog (not the explorer banner). */
  readonly manageWorkspacesError: string | null;
  readonly createManagedWorkspace: (name: string) => Promise<boolean>;
  readonly openWorkspace: () => Promise<void>;
  readonly openGitLinkImport: () => void;
  readonly launchWorkspace: (rootPath: string) => Promise<void>;
  /** Re-reads the known-workspace list (called on open of either surface). */
  readonly refreshKnownWorkspaces: () => void;
  /** Opens the manager after refreshing the list it will show. */
  readonly openManageWorkspaces: () => void;
  /** Removes a path from recents (with an Undo notification). Never the open workspace. */
  readonly forgetWorkspaceEntry: (rootPath: string) => Promise<void>;
  /** Deletes a managed vault and forgets it. False on failure (see manageWorkspacesError). */
  readonly deleteManagedWorkspace: (rootPath: string) => Promise<boolean>;
  readonly setCreateManagedWorkspaceOpen: Dispatch<SetStateAction<boolean>>;
  readonly setImportFromGitOpen: Dispatch<SetStateAction<boolean>>;
  readonly setManagedStorageNoticeOpen: Dispatch<SetStateAction<boolean>>;
  readonly setManageWorkspacesOpen: Dispatch<SetStateAction<boolean>>;
  /** Dismisses the manager's inline error without closing anything. */
  readonly clearManageWorkspacesError: () => void;
}

interface UseWorkspaceSwitchingOptions {
  readonly api: WorkspaceDesktopApi;
  /** Latest api, read after each `await`. */
  readonly apiRef: RefObject<WorkspaceDesktopApi>;
  readonly onWorkspaceLaunchedRef: RefObject<{ readonly onWorkspaceLaunched?: (rootPath: string) => void }>;
  readonly loadWorkspace: (rootPath: string) => Promise<void>;
  readonly startOperation: () => void;
  readonly endOperation: () => void;
  readonly setActionError: Dispatch<SetStateAction<string | null>>;
}

export function useWorkspaceSwitching({
  api,
  apiRef,
  onWorkspaceLaunchedRef,
  loadWorkspace,
  startOperation,
  endOperation,
  setActionError
}: UseWorkspaceSwitchingOptions): WorkspaceSwitchingController {
  const [accessCapabilities, setAccessCapabilities] = useState<NativeWorkspaceAccessCapabilities | null>(null);
  const [knownWorkspaces, setKnownWorkspaces] = useState<readonly NativeKnownWorkspace[]>([]);
  const [createManagedWorkspaceOpen, setCreateManagedWorkspaceOpen] = useState(false);
  const [managedStorageNoticeOpen, setManagedStorageNoticeOpen] = useState(false);
  const [importFromGitOpen, setImportFromGitOpen] = useState(false);
  const [manageWorkspacesOpen, setManageWorkspacesOpen] = useState(false);
  const [manageWorkspacesError, setManageWorkspacesError] = useState<string | null>(null);

  const refreshKnownWorkspaces = useCallback(() => {
    if (typeof apiRef.current.listKnownWorkspaces !== "function") return;
    void apiRef.current
      .listKnownWorkspaces()
      // Guard the shape: an older host or a stubbed bridge may resolve null.
      .then((workspaces) => setKnownWorkspaces(Array.isArray(workspaces) ? workspaces : []))
      // The manager is the only surface this list backs, so its failure goes
      // there — an empty list with no error reads as "your vaults are gone".
      .catch((error: unknown) => setManageWorkspacesError(workspaceErrorMessage(error)));
  }, [apiRef]);

  useEffect(() => {
    let active = true;
    if (typeof api.workspaceAccessCapabilities !== "function") {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- A host with no capability command gets the desktop answer at once; there is nothing to wait for.
      setAccessCapabilities(DESKTOP_WORKSPACE_ACCESS);
      return () => {
        active = false;
      };
    }
    void api.workspaceAccessCapabilities()
      .then((capabilities) => {
        if (active) setAccessCapabilities(capabilities);
      })
      .catch((error: unknown) => {
        if (!active) return;
        setActionError(workspaceErrorMessage(error));
        // Fall back to the same answer the absent-method branch gives. A
        // rejection used to leave `accessCapabilities` null forever, which is
        // not "we don't know yet" to the view — it renders "Checking workspace
        // access…" and keeps "Choose workspace" disabled, so a host whose
        // command is missing or merely failed locks the user out of opening a
        // vault at all. Saying "desktop rules" and showing the error is worse
        // only if the host really had stricter rules to report, and it could
        // not report them.
        setAccessCapabilities(DESKTOP_WORKSPACE_ACCESS);
      });
    return () => {
      active = false;
    };
  }, [api, setActionError]);

  // The list other windows may have changed — on mount, on refocus, and after
  // every mutation below.
  useEffect(() => {
    refreshKnownWorkspaces();
    window.addEventListener("focus", refreshKnownWorkspaces);
    return () => window.removeEventListener("focus", refreshKnownWorkspaces);
  }, [refreshKnownWorkspaces]);

  const launchWorkspace = useCallback(async (rootPath: string) => {
    try {
      if (accessCapabilities?.opensWorkspaceInNewWindow !== false) {
        await apiRef.current.openWorkspaceWindow(rootPath);
        onWorkspaceLaunchedRef.current.onWorkspaceLaunched?.(rootPath);
      } else {
        await loadWorkspace(rootPath);
      }
      refreshKnownWorkspaces();
    } catch (error) {
      setActionError(workspaceErrorMessage(error));
    }
  }, [accessCapabilities, apiRef, loadWorkspace, onWorkspaceLaunchedRef, refreshKnownWorkspaces, setActionError]);

  const createManagedWorkspace = useCallback(async (name: string): Promise<boolean> => {
    startOperation();
    setActionError(null);
    try {
      const workspace = await apiRef.current.createManagedWorkspace(name);
      setCreateManagedWorkspaceOpen(false);
      setManagedStorageNoticeOpen(true);
      await loadWorkspace(workspace.root_path);
      refreshKnownWorkspaces();
      return true;
    } catch (error) {
      setActionError(workspaceErrorMessage(error));
      return false;
    } finally {
      endOperation();
    }
  }, [apiRef, endOperation, loadWorkspace, refreshKnownWorkspaces, setActionError, startOperation]);

  const openGitLinkImport = useCallback(() => {
    setImportFromGitOpen(true);
  }, []);

  const openWorkspace = useCallback(async () => {
    try {
      const rootPath = await apiRef.current.pickWorkspaceDirectory();
      if (rootPath) await launchWorkspace(rootPath);
    } catch (error) {
      setActionError(workspaceErrorMessage(error));
    }
  }, [apiRef, launchWorkspace, setActionError]);

  const openManageWorkspaces = useCallback(() => {
    setManageWorkspacesError(null);
    refreshKnownWorkspaces();
    setManageWorkspacesOpen(true);
  }, [refreshKnownWorkspaces]);

  const forgetWorkspaceEntry = useCallback(async (rootPath: string) => {
    const name =
      knownWorkspaces.find((entry) => entry.rootPath === rootPath)?.name ?? rootPath;
    try {
      await forgetWorkspace(rootPath);
    } catch (error) {
      setManageWorkspacesError(workspaceErrorMessage(error));
      return;
    }
    refreshKnownWorkspaces();
    useNotificationStore.getState().addNotification({
      source: "workspaces",
      title: "Removed from list",
      message: `“${name}” was removed. Files on disk are untouched.`,
      severity: "transient",
      variant: "info",
      action: {
        label: "Undo",
        onClick: () => {
          // Undo re-adds the path as most-recent. The tabs and collapsed
          // groups pruned by the forget are not recovered — a limitation worth
          // knowing, not worth blocking removal on.
          void saveDesktopState({ recentWorkspacePaths: [rootPath] })
            .then(() => refreshKnownWorkspaces())
            .catch((error: unknown) => {
              useNotificationStore.getState().addNotification({
                source: "workspaces",
                title: "Could not restore",
                message: workspaceErrorMessage(error),
                severity: "transient",
                variant: "error"
              });
            });
        }
      }
    });
  }, [knownWorkspaces, refreshKnownWorkspaces]);

  const deleteManagedWorkspace = useCallback(async (rootPath: string): Promise<boolean> => {
    const name =
      knownWorkspaces.find((entry) => entry.rootPath === rootPath)?.name ?? rootPath;
    setManageWorkspacesError(null);
    try {
      await apiRef.current.deleteManagedWorkspace(rootPath);
    } catch (error) {
      setManageWorkspacesError(workspaceErrorMessage(error));
      return false;
    }
    // The vault is gone; desktop state forgets it the same way an external
    // removal does, so recents/tabs/views drop it rather than flag it missing.
    let forgetFailed = false;
    try {
      await forgetWorkspace(rootPath);
    } catch (error) {
      forgetFailed = true;
      setManageWorkspacesError(workspaceErrorMessage(error));
    }
    refreshKnownWorkspaces();
    // A forget failure leaves the deleted vault listed as "missing" — say so
    // rather than showing an error and a clean success side by side.
    useNotificationStore.getState().addNotification(forgetFailed
      ? {
          source: "workspaces",
          title: "Workspace deleted",
          message: `“${name}” was deleted, but it could not be removed from your workspace list — it may show up as a missing entry you can remove.`,
          severity: "transient",
          variant: "warning"
        }
      : {
          source: "workspaces",
          title: "Workspace deleted",
          message: `“${name}” and its history were removed from this device.`,
          severity: "transient",
          variant: "success"
        });
    return true;
  }, [apiRef, knownWorkspaces, refreshKnownWorkspaces]);

  return useMemo(
    () => ({
      accessCapabilities,
      knownWorkspaces,
      createManagedWorkspaceOpen,
      managedStorageNoticeOpen,
      importFromGitOpen,
      manageWorkspacesOpen,
      manageWorkspacesError,
      createManagedWorkspace,
      openWorkspace,
      openGitLinkImport,
      launchWorkspace,
      refreshKnownWorkspaces,
      openManageWorkspaces,
      forgetWorkspaceEntry,
      deleteManagedWorkspace,
      setCreateManagedWorkspaceOpen,
      setImportFromGitOpen,
      setManagedStorageNoticeOpen,
      setManageWorkspacesOpen,
      clearManageWorkspacesError: () => setManageWorkspacesError(null)
    }),
    [
      accessCapabilities,
      knownWorkspaces,
      createManagedWorkspaceOpen,
      managedStorageNoticeOpen,
      importFromGitOpen,
      manageWorkspacesOpen,
      manageWorkspacesError,
      createManagedWorkspace,
      openWorkspace,
      openGitLinkImport,
      launchWorkspace,
      refreshKnownWorkspaces,
      openManageWorkspaces,
      forgetWorkspaceEntry,
      deleteManagedWorkspace
    ]
  );
}
