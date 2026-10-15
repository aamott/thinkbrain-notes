import { useEffect, type ReactNode } from "react";

import { useWorkspaceSession } from "./useWorkspaceSession";
import { useWorkspaceSwitching } from "./useWorkspaceSwitching";
import { WorkspaceProviders, WorkspaceSwitchingDialogs } from "./WorkspaceSwitching";
import { workspaceDesktopApi, type WorkspaceDesktopApi } from "./workspaceAdapter";

/**
 * Minimal stand-in for the shell around the workspace session: owns one
 * `useWorkspaceSession` and one `useWorkspaceSwitching` wired to it, opens
 * `initialWorkspacePath` whenever it changes (a rerender with another path is
 * an in-window switch), and mounts the shell-level dialogs so
 * create/manage/import actions have somewhere to land.
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
  const session = useWorkspaceSession({ api });
  const { open } = session;
  useEffect(() => {
    if (initialWorkspacePath) void open(initialWorkspacePath);
  }, [initialWorkspacePath, open]);
  const switching = useWorkspaceSwitching({
    api,
    openWorkspaceInWindow: open,
    onWorkspaceLaunched
  });
  return (
    <WorkspaceProviders session={session} switching={switching}>
      {children(session.rootPath)}
      <WorkspaceSwitchingDialogs currentPath={session.rootPath ?? undefined} />
    </WorkspaceProviders>
  );
}
