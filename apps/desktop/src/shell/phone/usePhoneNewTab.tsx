import { FilePlus2, Folder, FolderCog, FolderOpen, FolderPlus, Link, Search } from "lucide-react";
import { useMemo } from "react";

import type { NewTabAction } from "../../tabs/NewTabView";
import { CREATE_MANAGED_WORKSPACE_LABEL, IMPORT_FROM_GIT_LABEL, MANAGE_WORKSPACES_LABEL, OPEN_FOLDER_LABEL } from "../../workspace/gitLinkImportCopy";
import type { WorkspaceSwitchingController } from "../../workspace/useWorkspaceSwitching";
import type { PhoneNavigation } from "./usePhoneNavigation";

interface UsePhoneNewTabParams {
  readonly workspaceName: string | null;
  readonly switching: WorkspaceSwitchingController;
  readonly createNewNote: () => void;
  readonly navigation: PhoneNavigation;
}

/** The phone's new-tab page: workspace entry points, or note/file/search actions. */
export function usePhoneNewTab({ workspaceName, switching, createNewNote, navigation }: UsePhoneNewTabParams) {
  return useMemo(() => {
    if (workspaceName === null) {
      const actions: NewTabAction[] = [];
      if (switching.accessCapabilities?.canCreateManagedWorkspace) {
        actions.push({ id: "create-vault", label: CREATE_MANAGED_WORKSPACE_LABEL, icon: <FolderPlus aria-hidden="true" className="size-4" />, onSelect: () => switching.setCreateManagedWorkspaceOpen(true) });
      }
      if (switching.accessCapabilities?.canOpenFolder) {
        actions.push({ id: "open-folder", label: OPEN_FOLDER_LABEL, icon: <FolderOpen aria-hidden="true" className="size-4" />, onSelect: () => void switching.openWorkspace() });
      }
      actions.push({ id: "import-git", label: IMPORT_FROM_GIT_LABEL, icon: <Link aria-hidden="true" className="size-4" />, onSelect: switching.openGitLinkImport });
      for (const workspace of switching.knownWorkspaces) {
        if (workspace.missing) continue;
        actions.push({ id: `open:${workspace.rootPath}`, label: workspace.name, icon: <Folder aria-hidden="true" className="size-4" />, onSelect: () => void switching.launchWorkspace(workspace.rootPath) });
      }
      actions.push({ id: "manage-workspaces", label: MANAGE_WORKSPACES_LABEL, icon: <FolderCog aria-hidden="true" className="size-4" />, onSelect: switching.openManageWorkspaces });
      return { workspaceName: workspaceName, actions };
    }
    return {
      workspaceName: workspaceName,
      actions: [
        { id: "new-note", label: "New note", icon: <FilePlus2 aria-hidden="true" className="size-4" />, onSelect: createNewNote },
        { id: "files", label: "Browse files", icon: <FolderOpen aria-hidden="true" className="size-4" />, onSelect: () => navigation.push({ kind: "files" }) },
        { id: "search", label: "Search", icon: <Search aria-hidden="true" className="size-4" />, onSelect: () => navigation.push({ kind: "panel", panel: "search" }) }
      ]
    };
  }, [workspaceName, createNewNote, navigation, switching]);
}
