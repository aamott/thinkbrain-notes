import { ShellIcon } from "../shell/icons";
import styles from "./RightPopout.module.css";

interface RightPopoutProps {
  readonly onClose: () => void;
}

/** Shell-owned slot; assistant content is implemented by the AI epic. */
export function RightPopout({ onClose }: RightPopoutProps) {
  return (
    <aside className={styles.popout} aria-labelledby="assistant-panel-title">
      <header className={styles.header}>
        <h2 id="assistant-panel-title">AI Assistant</h2>
        <button
          aria-label="Close AI Assistant"
          className={styles.closeButton}
          onClick={onClose}
          title="Close AI Assistant"
          type="button"
        >
          <ShellIcon className={styles.icon} name="close" />
        </button>
      </header>
      <p>The AI assistant is not available until the AI work is active.</p>
    </aside>
  );
}
