import { useState, type ReactNode } from "react";

import { useWorkspaceSwitching } from "./useWorkspaceSwitching";
import { WorkspaceSwitchingContext } from "./workspaceSwitchingContext";
import { WorkspaceSwitchingDialogs } from "./WorkspaceSwitching";
import { workspaceDesktopApi, type WorkspaceDesktopApi } from "./workspaceAdapter";

/**
 * Minimal stand-in for the shell around the switching controller: owns one
 * `useWorkspaceSwitching`, wires `openWorkspaceInWindow` to a state the
 * render prop can feed an explorer's `initialWorkspacePath`, and mounts the
 * shell-level dialogs so create/manage/import actions have somewhere to land.
 */
export function WorkspaceSwitchingHarness({
  api = workspaceDesktopApi,
  initialWorkspacePath = null,
  onWorkspaceLaunched,
  children
}: {
  readonly api?: WorkspaceDesktopApi;
  readonly initialWorkspacePath?: string | null;
  readonly onWorkspaceLaunched?: (rootPath: string) => void;
  readonly children: (workspacePath: string | null) => ReactNode;
}) {
  const [workspacePath, setWorkspacePath] = useState<string | null>(initialWorkspacePath);
  const switching = useWorkspaceSwitching({
    api,
    openWorkspaceInWindow: setWorkspacePath,
    onWorkspaceLaunched
  });
  return (
    <WorkspaceSwitchingContext.Provider value={switching}>
      {children(workspacePath)}
      <WorkspaceSwitchingDialogs currentPath={workspacePath ?? undefined} />
    </WorkspaceSwitchingContext.Provider>
  );
}
