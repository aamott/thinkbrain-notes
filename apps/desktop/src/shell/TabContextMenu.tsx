import { isFileResourceTab, tabAccessibleName, type DesktopTab } from "../tabs/tabModel";
import { Menu, MenuButton, MenuSeparator, type MenuPosition } from "./Menu";

/** Where a tab's right-click menu was asked for, plus the tab it is about. */
export type TabMenuState = MenuPosition & { readonly tabId: string };

const NOT_IMPLEMENTED = "Not implemented yet";

/**
 * Right-click menu for an open tab.
 *
 * Only placement is this component's — every behaviour (focus, arrow keys,
 * Escape, closing on an outside pointer) is the shared {@link Menu}'s.
 * "Close" routes through the same request-close path the close chip uses, so
 * a dirty tab still earns its save/discard/cancel dialog.
 */
export function TabContextMenu({
  menu,
  tabs,
  onClose,
  onRequestCloseTab,
  onCloseOtherTabs,
  onCloseTabsToRight,
}: {
  readonly menu: TabMenuState;
  readonly tabs: readonly DesktopTab[];
  readonly onClose: () => void;
  readonly onRequestCloseTab: (tabId: string) => void;
  readonly onCloseOtherTabs: (tabId: string) => void;
  readonly onCloseTabsToRight: (tabId: string) => void;
}) {
  const index = tabs.findIndex((tab) => tab.id === menu.tabId);
  const tab = index < 0 ? null : tabs[index]!;
  if (tab === null) return null;

  const others = tabs.filter((candidate) => candidate.id !== tab.id);
  const toRight = tabs.slice(index + 1);
  // A multi-close has no dirty guard to offer — when a dirty tab sits in the
  // target set the item is stubbed rather than silently skipping real work.
  const othersDirty = others.some((candidate) => candidate.isDirty);
  const rightDirty = toRight.some((candidate) => candidate.isDirty);

  const resource = tab.resource;
  const filePath =
    isFileResourceTab(tab) && resource?.rootPath !== undefined && resource.relativePath !== undefined
      ? `${resource.rootPath}/${resource.relativePath}`
      : null;

  const copyPath = () => {
    if (filePath === null) return;
    void navigator.clipboard?.writeText(filePath)?.catch((error: unknown) => {
      console.error("[titlebar] Could not copy the tab path to the clipboard.", error);
    });
    onClose();
  };

  return (
    <Menu at={menu} label={`${tabAccessibleName(tab)} options`} onClose={onClose}>
      <MenuButton
        label="Close"
        onClick={() => {
          onClose();
          onRequestCloseTab(tab.id);
        }}
      />
      <MenuButton
        label="Close other tabs"
        disabled={others.length === 0 || othersDirty}
        title={othersDirty ? NOT_IMPLEMENTED : undefined}
        onClick={() => {
          onClose();
          onCloseOtherTabs(tab.id);
        }}
      />
      <MenuButton
        label="Close tabs to the right"
        disabled={toRight.length === 0 || rightDirty}
        title={rightDirty ? NOT_IMPLEMENTED : undefined}
        onClick={() => {
          onClose();
          onCloseTabsToRight(tab.id);
        }}
      />
      <MenuSeparator />
      {filePath !== null && (
        <>
          <MenuButton label="Copy path" onClick={copyPath} />
          {/* No explorer reveal/select entry exists yet — stub until one does. */}
          <MenuButton label="Reveal in explorer" disabled title={NOT_IMPLEMENTED} onClick={() => undefined} />
        </>
      )}
      {/* Pinning is not part of the tab model — stub until it exists. */}
      <MenuButton label="Pin tab" disabled title={NOT_IMPLEMENTED} onClick={() => undefined} />
    </Menu>
  );
}
