import { ShellIcon } from "../shell/icons";
import styles from "./BottomRegion.module.css";

interface BottomRegionProps {
  readonly onClose: () => void;
}

/** Shell-owned bottom slot; its tab/content framework is a later story. */
export function BottomRegion({ onClose }: BottomRegionProps) {
  return (
    <section className={styles.region} aria-labelledby="bottom-region-title">
      <header className={styles.header}>
        <h2 id="bottom-region-title">Bottom panel</h2>
        <button
          aria-label="Close bottom region"
          className={styles.closeButton}
          onClick={onClose}
          title="Close bottom region"
          type="button"
        >
          <ShellIcon className={styles.icon} name="close" />
        </button>
      </header>
      <p>Bottom-panel content is not available until the bottom-panel work is active.</p>
    </section>
  );
}
