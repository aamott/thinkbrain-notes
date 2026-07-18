import type { Tab } from "@thinkbrain/core";
import type { KeyboardEvent } from "react";

import { ShellIcon } from "../shell/icons";
import { getTabControlId, getTabPanelId } from "./tabDom";
import styles from "./TabStrip.module.css";

interface TabStripProps {
  readonly activeTabId: string | null;
  readonly onActivateTab: (tabId: string) => void;
  readonly onCloseTab: (tabId: string) => void;
  readonly tabs: readonly Tab[];
}

export function TabStrip({
  activeTabId,
  onActivateTab,
  onCloseTab,
  tabs
}: TabStripProps) {
  function activateTabFromKeyboard(
    event: KeyboardEvent<HTMLButtonElement>,
    index: number
  ) {
    const nextIndex = getNextTabIndex(event.key, index, tabs.length);

    const nextTab = nextIndex === null ? undefined : tabs[nextIndex];
    if (!nextTab) {
      return;
    }

    event.preventDefault();
    onActivateTab(nextTab.id);
    document.getElementById(getTabControlId(nextTab.id))?.focus();
  }

  return (
    <div className={styles.tabList} aria-label="Open tabs" role="tablist">
      {tabs.map((tab, index) => {
        const isActive = tab.id === activeTabId;

        return (
          <div
            key={tab.id}
            className={isActive ? styles.activeTab : styles.tab}
            role="presentation"
          >
            <button
              aria-controls={getTabPanelId(tab.id)}
              aria-selected={isActive}
              className={styles.tabButton}
              id={getTabControlId(tab.id)}
              onClick={() => onActivateTab(tab.id)}
              onKeyDown={(event) => activateTabFromKeyboard(event, index)}
              role="tab"
              type="button"
            >
              <span className={styles.tabTitle}>{tab.title}</span>
              {tab.isDirty ? (
                <span aria-label="Unsaved changes" className={styles.dirtyDot} />
              ) : null}
            </button>
            <button
              aria-label={`Close ${tab.title}`}
              className={styles.closeButton}
              onClick={() => onCloseTab(tab.id)}
              type="button"
            >
              <ShellIcon className={styles.closeIcon} name="close" />
            </button>
          </div>
        );
      })}
    </div>
  );
}

function getNextTabIndex(
  key: string,
  index: number,
  tabCount: number
): number | null {
  switch (key) {
    case "ArrowRight":
      return (index + 1) % tabCount;
    case "ArrowLeft":
      return (index - 1 + tabCount) % tabCount;
    case "Home":
      return 0;
    case "End":
      return tabCount - 1;
    default:
      return null;
  }
}
