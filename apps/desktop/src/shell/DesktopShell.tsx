import { useState } from "react";

import { saveActiveDocument } from "../editor/saveDocument";
import { BottomRegion } from "../panels/BottomRegion";
import { LeftPopout } from "../panels/LeftPopout";
import { RightPopout } from "../panels/RightPopout";
import { useAppStore } from "../stores/appStore";
import { CloseTabDialog } from "../tabs/CloseTabDialog";
import { desktopTabRegistry } from "../tabs/tabRegistry";
import { getTabControlId, getTabPanelId } from "../tabs/tabDom";
import { ActivityBar } from "./ActivityBar";
import { StatusBar } from "./StatusBar";
import { getUnavailableMessage, type UnavailableFeature } from "./shellTypes";
import { TitleBar } from "./TitleBar";
import styles from "./DesktopShell.module.css";

export function DesktopShell() {
  const activePanel = useAppStore((state) => state.activePanel);
  const bootChecks = useAppStore((state) => state.bootChecks);
  const indexing = useAppStore((state) => state.indexing);
  const nativeShell = useAppStore((state) => state.nativeShell);
  const recordBootCheck = useAppStore((state) => state.recordBootCheck);
  const tabState = useAppStore((state) => state.tabState);
  const editorDocuments = useAppStore((state) => state.editorDocuments);
  const activateTab = useAppStore((state) => state.activateTab);
  const closeTab = useAppStore((state) => state.closeTab);
  const setActivePanel = useAppStore((state) => state.setActivePanel);
  const [isLeftPanelOpen, setIsLeftPanelOpen] = useState(true);
  const [isRightPopoutOpen, setIsRightPopoutOpen] = useState(false);
  const [isBottomRegionOpen, setIsBottomRegionOpen] = useState(false);
  const [unavailableNotice, setUnavailableNotice] = useState<string | null>(null);
  const [pendingCloseTabId, setPendingCloseTabId] = useState<string | null>(null);
  const [isSavingBeforeClose, setIsSavingBeforeClose] = useState(false);

  const activeTab = tabState.tabs.find((tab) => tab.id === tabState.activeTabId);
  const pendingCloseTab = tabState.tabs.find(
    (tab) => tab.id === pendingCloseTabId
  );

  function selectPanel(panel: typeof activePanel) {
    setUnavailableNotice(null);

    if (panel === activePanel && isLeftPanelOpen) {
      setIsLeftPanelOpen(false);
      return;
    }

    setActivePanel(panel);
    setIsLeftPanelOpen(true);
  }

  function reportUnavailable(feature: UnavailableFeature) {
    setUnavailableNotice(getUnavailableMessage(feature));
  }

  function toggleAssistant() {
    setUnavailableNotice(null);
    setIsRightPopoutOpen((isOpen) => !isOpen);
  }

  function requestCloseTab(tabId: string) {
    const document = editorDocuments[tabId];

    if (document?.isDirty) {
      activateTab(tabId);
      setPendingCloseTabId(tabId);
      return;
    }

    closeTab(tabId);
  }

  async function saveAndCloseTab() {
    if (!pendingCloseTabId) {
      return;
    }

    setIsSavingBeforeClose(true);
    const saved = await saveActiveDocument();
    setIsSavingBeforeClose(false);

    if (saved) {
      closeTab(pendingCloseTabId);
      setPendingCloseTabId(null);
    }
  }

  return (
    <div className={styles.shell}>
      <TitleBar
        activeTabId={tabState.activeTabId}
        onActivateTab={activateTab}
        onCloseTab={requestCloseTab}
        onRecordBootCheck={recordBootCheck}
        onUnavailableAction={reportUnavailable}
        tabs={tabState.tabs}
      />

      <div className={styles.workbench}>
        <ActivityBar
          activePanel={activePanel}
          assistantOpen={isRightPopoutOpen}
          isPanelOpen={isLeftPanelOpen}
          onSelectPanel={selectPanel}
          onToggleAssistant={toggleAssistant}
          onUnavailableAction={reportUnavailable}
        />

        {isLeftPanelOpen ? (
          <div className={styles.leftPopout}>
            <LeftPopout activePanel={activePanel} />
          </div>
        ) : null}

        <main className={styles.editorWorkspace} aria-labelledby="app-title">
          <section className={styles.editorRegion} aria-label="Editor workspace">
            {activeTab ? (
              <div
                className={styles.tabContent}
                aria-labelledby={getTabControlId(activeTab.id)}
                id={getTabPanelId(activeTab.id)}
                role="tabpanel"
              >
                {desktopTabRegistry.get(activeTab.kind)?.render(activeTab) ?? (
                  <div className={styles.editorPlaceholder}>
                    <p className={styles.eyebrow}>Unavailable</p>
                    <h2>Unknown tab type</h2>
                    <p>This extension tab has no desktop renderer.</p>
                  </div>
                )}
              </div>
            ) : (
              <div className={styles.editorPlaceholder}>
                <p className={styles.eyebrow}>Editor area</p>
                <h2 id="editor-area-title">No note selected</h2>
                <p>Open a Markdown file from the explorer to start editing.</p>
              </div>
            )}
          </section>
          {isBottomRegionOpen ? (
            <BottomRegion onClose={() => setIsBottomRegionOpen(false)} />
          ) : null}
        </main>

        {isRightPopoutOpen ? (
          <div className={styles.rightPopout}>
            <RightPopout onClose={() => setIsRightPopoutOpen(false)} />
          </div>
        ) : null}
      </div>

      <StatusBar
        bootChecks={bootChecks}
        bottomRegionOpen={isBottomRegionOpen}
        indexing={indexing}
        nativeShell={nativeShell}
        notice={unavailableNotice}
        onToggleBottomRegion={() => setIsBottomRegionOpen((isOpen) => !isOpen)}
      />

      {pendingCloseTab ? (
        <CloseTabDialog
          isSaving={isSavingBeforeClose}
          onCancel={() => setPendingCloseTabId(null)}
          onDiscard={() => {
            closeTab(pendingCloseTab.id);
            setPendingCloseTabId(null);
          }}
          onSave={() => {
            void saveAndCloseTab();
          }}
          title={pendingCloseTab.title}
        />
      ) : null}
    </div>
  );
}
