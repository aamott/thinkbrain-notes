import { FilePlus2, FolderOpen, Search } from "lucide-react";
import { useMemo } from "react";

import type { WorkspaceSwitchingController } from "../../workspace/useWorkspaceSwitching";
import { noWorkspaceActions } from "../newTabActions";
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
      return { workspaceName, actions: noWorkspaceActions(switching) };
    }
    return {
      workspaceName,
      actions: [
        { id: "new-note", label: "New note", icon: <FilePlus2 aria-hidden="true" className="size-4" />, onSelect: createNewNote },
        { id: "files", label: "Browse files", icon: <FolderOpen aria-hidden="true" className="size-4" />, onSelect: () => navigation.push({ kind: "files" }) },
        { id: "search", label: "Search", icon: <Search aria-hidden="true" className="size-4" />, onSelect: () => navigation.push({ kind: "panel", panel: "search" }) }
      ]
    };
  }, [workspaceName, createNewNote, navigation, switching]);
}
