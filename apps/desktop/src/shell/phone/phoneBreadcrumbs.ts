import { getDesktopPanelOrUndefined } from "../../panels/panelRegistryModel";
import { restoreBreadcrumbSegments, type DesktopTab } from "../../tabs/tabModel";
import type { PhoneRoute } from "./usePhoneNavigation";

/**
 * Browser-style location pill: workspace, then the route's own crumb trail —
 * real folders for file tabs (`.md` stripped only from note editors so
 * code/media keep their extension), a label for chrome surfaces.
 */
export function phoneBreadcrumbs(
  route: PhoneRoute,
  activeTab: DesktopTab | null,
  workspaceLabel: string
): string[] {
  if (route.kind === "files") return [workspaceLabel, "Files"];
  if (route.kind === "panel") {
    return [workspaceLabel, getDesktopPanelOrUndefined(route.panel)?.label ?? route.panel];
  }
  // A restore preview keeps its operation in the trail: workspace, then
  // "Restore", then the file's real path — extension kept, since the pill
  // names the file being restored, not a note title.
  const restoreSegments = restoreBreadcrumbSegments(activeTab);
  if (restoreSegments) return [workspaceLabel, ...restoreSegments];
  const relativePath = activeTab?.resource?.relativePath;
  if (!relativePath) return [workspaceLabel, activeTab?.title ?? workspaceLabel];
  const segments = relativePath.split("/").filter(Boolean);
  const last = segments.at(-1);
  if (activeTab?.kind === "editor" && last?.toLowerCase().endsWith(".md")) {
    segments[segments.length - 1] = last.slice(0, -".md".length);
  }
  return [workspaceLabel, ...segments];
}
