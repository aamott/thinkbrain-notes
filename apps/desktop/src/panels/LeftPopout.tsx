import type { ActivePanel } from "../stores/appStore";
import { SearchPanel } from "../search/SearchPanel";
import { SettingsPanel } from "../settings/SettingsPanel";
import { WorkspaceExplorer } from "../workspace/WorkspaceExplorer";

export function LeftPopout({ activePanel }: { readonly activePanel: ActivePanel }) {
  if (activePanel === "search") {
    return <SearchPanel />;
  }

  if (activePanel === "settings") {
    return <SettingsPanel />;
  }

  return <WorkspaceExplorer />;
}
