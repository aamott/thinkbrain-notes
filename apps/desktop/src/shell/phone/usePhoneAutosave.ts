import { useEffect, useRef } from "react";

import type { DesktopTab } from "../../tabs/tabModel";
import type { ShellState } from "../useShellState";

/**
 * Mobile autosave: the phone shell has no Save button, so the document is
 * saved automatically after the user stops typing for 1.5s. The effect
 * watches the active document's contents and dirty flag — only a dirty
 * document triggers a save, and the timer is cancelled if the user keeps
 * typing or switches tabs before it fires.
 *
 * Deps are passed in as values destructured from `shell` because the shell
 * object is a new literal every render — depending on `shell` directly would
 * reset the timer on every render and the save would never fire under
 * background state churn.
 */
export function usePhoneAutosave(
  activeTab: DesktopTab | null,
  activeDocContents: string | undefined,
  saveDocument: ShellState["saveDocument"]
): void {
  const activeTabDirty = activeTab?.isDirty;
  const autosaveRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (autosaveRef.current) {
      clearTimeout(autosaveRef.current);
      autosaveRef.current = null;
    }
    if (!activeTabDirty || !activeTab) return;
    const tab = activeTab;
    autosaveRef.current = setTimeout(() => {
      void saveDocument(tab);
    }, 1500);
    return () => {
      if (autosaveRef.current) {
        clearTimeout(autosaveRef.current);
        autosaveRef.current = null;
      }
    };
  }, [activeTab, activeTabDirty, activeDocContents, saveDocument]);
}
