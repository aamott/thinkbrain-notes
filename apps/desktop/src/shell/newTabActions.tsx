import { Folder, FolderCog, FolderOpen, FolderPlus, Link } from "lucide-react";

import type { NewTabAction } from "../tabs/NewTabView";
import {
  CREATE_MANAGED_WORKSPACE_LABEL,
  IMPORT_FROM_GIT_LABEL,
  MANAGE_WORKSPACES_LABEL,
  OPEN_FOLDER_LABEL
} from "../workspace/gitLinkImportCopy";
import type { WorkspaceSwitchingController } from "../workspace/useWorkspaceSwitching";

/**
 * The new-tab page's entry points while no workspace is open — create, open,
 * import, plus every known non-missing workspace — shared by both chromes so
 * the landing tab can never offer a different set on desktop than on phone.
 */
export function noWorkspaceActions(switching: WorkspaceSwitchingController): NewTabAction[] {
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
  return actions;
}
