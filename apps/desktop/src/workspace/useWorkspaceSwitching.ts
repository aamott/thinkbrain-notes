import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from "react";
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
 * opposed to exploring the one that is open. Instantiated once at shell level
 * and shared through `WorkspaceSwitchingContext`, rendered by the workspace
 * selector (whichever placement it takes) and the manager/create/import
 * dialogs the shell mounts.
 *
 * In-window opens do not load the workspace here: they go through
 * `openWorkspaceInWindow`, which points the explorer's `initialWorkspacePath`
 * at the new root and lets its existing load path run. Launch, pick and
 * capability failures surface as transient notifications (the explorer banner
 * belongs to in-workspace operations); create-dialog failures stay in the
 * dialog via `createManagedWorkspaceError`.
 */
export interface WorkspaceSwitchingController {
  readonly accessCapabilities: NativeWorkspaceAccessCapabilities | null;
  /**
   * Every workspace the app knows about — recents in recency order, then
   * managed vaults — including entries whose folder is currently missing.
   */
  readonly knownWorkspaces: readonly NativeKnownWorkspace[];
  /** Roots other live windows already show — for the manager's "open elsewhere" badge. */
  readonly rootsOpenElsewhere: readonly string[];
  readonly createManagedWorkspaceOpen: boolean;
  readonly managedStorageNoticeOpen: boolean;
  readonly importFromGitOpen: boolean;
  readonly manageWorkspacesOpen: boolean;
  /** A failure belonging to the manager dialog. */
  readonly manageWorkspacesError: string | null;
  /** Busy state of the create-managed-vault dialog's submit. */
  readonly creatingManagedWorkspace: boolean;
  /** A failure belonging to the create-managed-vault dialog. */
  readonly createManagedWorkspaceError: string | null;
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
  /**
   * Opens a workspace in this window. The shell points the explorer's
   * `initialWorkspacePath` at the root so the explorer's own load path —
   * settings restore, snapshot, entry listing — runs unchanged.
   */
  readonly openWorkspaceInWindow: (rootPath: string) => void;
  /** Fired after a new-window launch so the shell can persist the choice. */
  readonly onWorkspaceLaunched?: (rootPath: string) => void;
}

/** Reports a switching failure the explorer banner can no longer host. */
const notifyWorkspaceError = (message: string): void => {
  useNotificationStore.getState().addNotification({
    source: "workspaces",
    title: "Workspace action failed",
    message,
    severity: "transient",
    variant: "error"
  });
};

export function useWorkspaceSwitching({
  api,
  openWorkspaceInWindow,
  onWorkspaceLaunched
}: UseWorkspaceSwitchingOptions): WorkspaceSwitchingController {
  const [accessCapabilities, setAccessCapabilities] = useState<NativeWorkspaceAccessCapabilities | null>(null);
  const [knownWorkspaces, setKnownWorkspaces] = useState<readonly NativeKnownWorkspace[]>([]);
  const [rootsOpenElsewhere, setRootsOpenElsewhere] = useState<readonly string[]>([]);
  const [createManagedWorkspaceOpen, setCreateManagedWorkspaceOpenState] = useState(false);
  const [managedStorageNoticeOpen, setManagedStorageNoticeOpen] = useState(false);
  const [importFromGitOpen, setImportFromGitOpen] = useState(false);
  const [manageWorkspacesOpen, setManageWorkspacesOpen] = useState(false);
  const [manageWorkspacesError, setManageWorkspacesError] = useState<string | null>(null);
  const [creatingManagedWorkspace, setCreatingManagedWorkspace] = useState(false);
  const [createManagedWorkspaceError, setCreateManagedWorkspaceError] = useState<string | null>(null);

  // Refs holding the latest inputs so async helpers never read a stale
  // closure after an `await`. Updated in an effect per the react-hooks/refs
  // rule; the callbacks they replace are cheap, so no dep churn matters.
  const apiRef = useRef(api);
  const callbacksRef = useRef({ openWorkspaceInWindow, onWorkspaceLaunched });
  useEffect(() => {
    apiRef.current = api;
    callbacksRef.current = { openWorkspaceInWindow, onWorkspaceLaunched };
  });

  const refreshKnownWorkspaces = useCallback(() => {
    if (typeof apiRef.current.listKnownWorkspaces !== "function") return;
    void apiRef.current
      .listKnownWorkspaces()
      // Guard the shape: an older host or a stubbed bridge may resolve null.
      .then((workspaces) => setKnownWorkspaces(Array.isArray(workspaces) ? workspaces : []))
      // The manager is the only surface this list backs, so its failure goes
      // there — an empty list with no error reads as "your vaults are gone".
      .catch((error: unknown) => setManageWorkspacesError(workspaceErrorMessage(error)));
    const probeElsewhere = apiRef.current.listWorkspaceRootsOpenElsewhere;
    if (typeof probeElsewhere !== "function") return;
    void probeElsewhere()
      .then((roots) => setRootsOpenElsewhere(Array.isArray(roots) ? roots : []))
      // A failed probe just means a missing badge — keep the previous list
      // rather than reporting a workspace failure the user cannot act on.
      .catch((error: unknown) => console.error("[workspace] roots-open-elsewhere probe failed:", error));
  }, []);

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
        notifyWorkspaceError(workspaceErrorMessage(error));
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
  }, [api]);

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
        callbacksRef.current.onWorkspaceLaunched?.(rootPath);
      } else {
        callbacksRef.current.openWorkspaceInWindow(rootPath);
      }
      refreshKnownWorkspaces();
    } catch (error) {
      notifyWorkspaceError(workspaceErrorMessage(error));
    }
  }, [accessCapabilities, refreshKnownWorkspaces]);

  const createManagedWorkspace = useCallback(async (name: string): Promise<boolean> => {
    setCreatingManagedWorkspace(true);
    setCreateManagedWorkspaceError(null);
    try {
      const workspace = await apiRef.current.createManagedWorkspace(name);
      setCreateManagedWorkspaceOpenState(false);
      setManagedStorageNoticeOpen(true);
      callbacksRef.current.openWorkspaceInWindow(workspace.root_path);
      refreshKnownWorkspaces();
      return true;
    } catch (error) {
      setCreateManagedWorkspaceError(workspaceErrorMessage(error));
      return false;
    } finally {
      setCreatingManagedWorkspace(false);
    }
  }, [refreshKnownWorkspaces]);

  const openGitLinkImport = useCallback(() => {
    setImportFromGitOpen(true);
  }, []);

  const openWorkspace = useCallback(async () => {
    try {
      const rootPath = await apiRef.current.pickWorkspaceDirectory();
      if (rootPath) await launchWorkspace(rootPath);
    } catch (error) {
      notifyWorkspaceError(workspaceErrorMessage(error));
    }
  }, [launchWorkspace]);

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
  }, [knownWorkspaces, refreshKnownWorkspaces]);

  // Opening or closing the dialog starts a fresh attempt, so a previous
  // failure never lingers into the next open.
  const setCreateManagedWorkspaceOpen = useCallback((value: SetStateAction<boolean>) => {
    setCreateManagedWorkspaceError(null);
    setCreateManagedWorkspaceOpenState(value);
  }, []);

  return useMemo(
    () => ({
      accessCapabilities,
      knownWorkspaces,
      rootsOpenElsewhere,
      createManagedWorkspaceOpen,
      managedStorageNoticeOpen,
      importFromGitOpen,
      manageWorkspacesOpen,
      manageWorkspacesError,
      creatingManagedWorkspace,
      createManagedWorkspaceError,
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
      rootsOpenElsewhere,
      createManagedWorkspaceOpen,
      managedStorageNoticeOpen,
      importFromGitOpen,
      manageWorkspacesOpen,
      manageWorkspacesError,
      creatingManagedWorkspace,
      createManagedWorkspaceError,
      createManagedWorkspace,
      openWorkspace,
      openGitLinkImport,
      launchWorkspace,
      refreshKnownWorkspaces,
      openManageWorkspaces,
      forgetWorkspaceEntry,
      deleteManagedWorkspace,
      setCreateManagedWorkspaceOpen
    ]
  );
}
