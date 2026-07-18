import { classNames } from "@thinkbrain/ui";
import type { Tab } from "@thinkbrain/core";

import { ShellIcon } from "./icons";
import type { UnavailableFeature } from "./shellTypes";
import { TabStrip } from "../tabs/TabStrip";
import styles from "./TitleBar.module.css";

interface TitleBarProps {
  readonly activeTabId: string | null;
  readonly onActivateTab: (tabId: string) => void;
  readonly onCloseTab: (tabId: string) => void;
  readonly onRecordBootCheck: () => void;
  readonly onUnavailableAction: (feature: UnavailableFeature) => void;
  readonly tabs: readonly Tab[];
}

export function TitleBar({
  activeTabId,
  onActivateTab,
  onCloseTab,
  onRecordBootCheck,
  onUnavailableAction,
  tabs
}: TitleBarProps) {
  return (
    <header className={styles.titleBar} aria-label="Application title bar">
      <div className={styles.identity}>
        <span className={styles.logo} aria-hidden="true">T</span>
        <h1 className={styles.title} id="app-title">Thinkbrain Notes</h1>
        <span className={styles.context}>Local Markdown workspace</span>
      </div>

      <TabStrip
        activeTabId={activeTabId}
        onActivateTab={onActivateTab}
        onCloseTab={onCloseTab}
        tabs={tabs}
      />

      <div className={styles.controls}>
        <button
          aria-label="Verify state wiring"
          className={classNames(styles.iconButton, styles.verifyButton)}
          onClick={onRecordBootCheck}
          title="Verify state wiring"
          type="button"
        >
          <ShellIcon className={styles.icon} name="properties" />
        </button>
        <button
          aria-disabled="true"
          aria-label="Theme settings"
          className={styles.iconButton}
          onClick={() => onUnavailableAction("theme")}
          title="Theme controls are planned separately"
          type="button"
        >
          <ShellIcon className={styles.icon} name="theme" />
        </button>
      </div>
    </header>
  );
}
