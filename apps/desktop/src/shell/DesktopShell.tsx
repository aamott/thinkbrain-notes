import { useState } from "react";

import { MarkdownEditor } from "../editor/MarkdownEditor";
import { BottomRegion } from "../panels/BottomRegion";
import { LeftPopout } from "../panels/LeftPopout";
import { RightPopout } from "../panels/RightPopout";
import { useAppStore } from "../stores/appStore";
import { ActivityBar } from "./ActivityBar";
import { StatusBar } from "./StatusBar";
import { getUnavailableMessage, type UnavailableFeature } from "./shellTypes";
import { TitleBar } from "./TitleBar";
import styles from "./DesktopShell.module.css";

export function DesktopShell() {
  const activeDocument = useAppStore((state) => state.activeDocument);
  const activePanel = useAppStore((state) => state.activePanel);
  const bootChecks = useAppStore((state) => state.bootChecks);
  const indexing = useAppStore((state) => state.indexing);
  const nativeShell = useAppStore((state) => state.nativeShell);
  const recordBootCheck = useAppStore((state) => state.recordBootCheck);
  const setActivePanel = useAppStore((state) => state.setActivePanel);
  const [isLeftPanelOpen, setIsLeftPanelOpen] = useState(true);
  const [isRightPopoutOpen, setIsRightPopoutOpen] = useState(false);
  const [isBottomRegionOpen, setIsBottomRegionOpen] = useState(false);
  const [unavailableNotice, setUnavailableNotice] = useState<string | null>(null);

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

  return (
    <div className={styles.shell}>
      <TitleBar
        onRecordBootCheck={recordBootCheck}
        onUnavailableAction={reportUnavailable}
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
            {activeDocument.file ? (
              <MarkdownEditor />
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
    </div>
  );
}
