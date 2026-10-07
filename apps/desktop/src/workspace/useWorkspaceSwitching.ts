import { useCallback, useEffect, useMemo, useState, type Dispatch, type RefObject, type SetStateAction } from "react";
import type { NativeWorkspaceAccessCapabilities } from "../native/commands";
import { workspaceErrorMessage } from "./workspaceExplorerModel";
import type { WorkspaceDesktopApi } from "./workspaceAdapter";

const DESKTOP_WORKSPACE_ACCESS: NativeWorkspaceAccessCapabilities = {
  canOpenFolder: true,
  canCreateManagedWorkspace: false,
  opensWorkspaceInNewWindow: true
};

/**
 * Everything about choosing, creating and importing a workspace — as opposed
 * to exploring the one that is open. Owned by `WorkspaceExplorer`, rendered by
 * `WorkspaceSwitching` and the workspace selector.
 */
export interface WorkspaceSwitchingController {
  readonly accessCapabilities: NativeWorkspaceAccessCapabilities | null;
  /** Managed vaults first, then recents, deduplicated. */
  readonly availableWorkspacePaths: readonly string[];
  readonly createManagedWorkspaceOpen: boolean;
  readonly managedStorageNoticeOpen: boolean;
  readonly importFromGitOpen: boolean;
  readonly createManagedWorkspace: (name: string) => Promise<boolean>;
  readonly openWorkspace: () => Promise<void>;
  readonly openGitLinkImport: () => void;
  readonly launchWorkspace: (rootPath: string) => Promise<void>;
  readonly setCreateManagedWorkspaceOpen: Dispatch<SetStateAction<boolean>>;
  readonly setImportFromGitOpen: Dispatch<SetStateAction<boolean>>;
  readonly setManagedStorageNoticeOpen: Dispatch<SetStateAction<boolean>>;
}

interface UseWorkspaceSwitchingOptions {
  readonly api: WorkspaceDesktopApi;
  /** Latest api, read after each `await`. */
  readonly apiRef: RefObject<WorkspaceDesktopApi>;
  readonly onWorkspaceLaunchedRef: RefObject<{ readonly onWorkspaceLaunched?: (rootPath: string) => void }>;
  readonly recentWorkspacePaths: readonly string[];
  readonly loadWorkspace: (rootPath: string) => Promise<void>;
  readonly startOperation: () => void;
  readonly endOperation: () => void;
  readonly setActionError: Dispatch<SetStateAction<string | null>>;
}

export function useWorkspaceSwitching({
  api,
  apiRef,
  onWorkspaceLaunchedRef,
  recentWorkspacePaths,
  loadWorkspace,
  startOperation,
  endOperation,
  setActionError
}: UseWorkspaceSwitchingOptions): WorkspaceSwitchingController {
  const [accessCapabilities, setAccessCapabilities] = useState<NativeWorkspaceAccessCapabilities | null>(null);
  const [managedWorkspacePaths, setManagedWorkspacePaths] = useState<readonly string[]>([]);
  const [createManagedWorkspaceOpen, setCreateManagedWorkspaceOpen] = useState(false);
  const [managedStorageNoticeOpen, setManagedStorageNoticeOpen] = useState(false);
  const [importFromGitOpen, setImportFromGitOpen] = useState(false);
  const availableWorkspacePaths = useMemo(
    () => [...new Set([...managedWorkspacePaths, ...recentWorkspacePaths])],
    [managedWorkspacePaths, recentWorkspacePaths]
  );

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
      .then(async (capabilities) => {
        if (!active) return;
        setAccessCapabilities(capabilities);
        if (!capabilities.canCreateManagedWorkspace) return;
        const workspaces = await api.listManagedWorkspaces();
        if (active) setManagedWorkspacePaths(workspaces.map((workspace) => workspace.root_path));
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

  const launchWorkspace = useCallback(async (rootPath: string) => {
    try {
      if (accessCapabilities?.opensWorkspaceInNewWindow !== false) {
        await apiRef.current.openWorkspaceWindow(rootPath);
        onWorkspaceLaunchedRef.current.onWorkspaceLaunched?.(rootPath);
      } else {
        await loadWorkspace(rootPath);
      }
    } catch (error) {
      setActionError(workspaceErrorMessage(error));
    }
  }, [accessCapabilities, apiRef, loadWorkspace, onWorkspaceLaunchedRef, setActionError]);

  const createManagedWorkspace = useCallback(async (name: string): Promise<boolean> => {
    startOperation();
    setActionError(null);
    try {
      const workspace = await apiRef.current.createManagedWorkspace(name);
      setManagedWorkspacePaths((paths) => [...new Set([...paths, workspace.root_path])]);
      setCreateManagedWorkspaceOpen(false);
      setManagedStorageNoticeOpen(true);
      await loadWorkspace(workspace.root_path);
      return true;
    } catch (error) {
      setActionError(workspaceErrorMessage(error));
      return false;
    } finally {
      endOperation();
    }
  }, [apiRef, endOperation, loadWorkspace, setActionError, startOperation]);

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

  return useMemo(
    () => ({
      accessCapabilities,
      availableWorkspacePaths,
      createManagedWorkspaceOpen,
      managedStorageNoticeOpen,
      importFromGitOpen,
      createManagedWorkspace,
      openWorkspace,
      openGitLinkImport,
      launchWorkspace,
      setCreateManagedWorkspaceOpen,
      setImportFromGitOpen,
      setManagedStorageNoticeOpen
    }),
    [
      accessCapabilities,
      availableWorkspacePaths,
      createManagedWorkspaceOpen,
      managedStorageNoticeOpen,
      importFromGitOpen,
      createManagedWorkspace,
      openWorkspace,
      openGitLinkImport,
      launchWorkspace
    ]
  );
}
