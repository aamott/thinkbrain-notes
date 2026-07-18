/** Keeps tab-panel IDs valid when a workspace path contains whitespace. */
export function getTabPanelId(tabId: string): string {
  return `tab-content-${encodeURIComponent(tabId)}`;
}

export function getTabControlId(tabId: string): string {
  return `tab-control-${encodeURIComponent(tabId)}`;
}
