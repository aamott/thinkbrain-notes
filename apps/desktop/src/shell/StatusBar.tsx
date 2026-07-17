import type { IndexingState, NativeShellState } from "../stores/appStore";
import { indexingText, nativeShellText } from "./statusText";
import styles from "./StatusBar.module.css";

interface StatusBarProps {
  readonly bootChecks: number;
  readonly bottomRegionOpen: boolean;
  readonly indexing: IndexingState;
  readonly nativeShell: NativeShellState;
  readonly notice: string | null;
  readonly onToggleBottomRegion: () => void;
}

export function StatusBar({
  bootChecks,
  bottomRegionOpen,
  indexing,
  nativeShell,
  notice,
  onToggleBottomRegion
}: StatusBarProps) {
  return (
    <footer className={styles.statusBar} aria-label="Workspace status">
      <span className={nativeShell.status === "error" ? styles.error : undefined} role="status">
        {nativeShellText(nativeShell)}
      </span>
      <span>{indexingText(indexing)}</span>
      <span>Boot checks: {bootChecks}</span>
      {notice ? <span className={styles.notice} role="status">{notice}</span> : null}
      <button
        aria-label={bottomRegionOpen ? "Close bottom region" : "Open bottom region"}
        aria-pressed={bottomRegionOpen}
        className={styles.panelButton}
        onClick={onToggleBottomRegion}
        title={bottomRegionOpen ? "Close bottom region" : "Open bottom region"}
        type="button"
      >
        Bottom
      </button>
    </footer>
  );
}
