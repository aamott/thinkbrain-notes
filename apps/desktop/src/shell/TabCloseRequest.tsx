import { DirtyCloseDialog } from "./DirtyCloseDialog";
import { useSettingsStore } from "../settings/settingsStore";
import type { ShellState } from "./useShellState";

/**
 * The "save, discard or cancel" prompt for a tab with unsaved work.
 *
 * Rendered by both chromes. `requestClose` on a dirty tab does not close it —
 * it parks a `closeRequest` and waits for an answer — so a shell that omits
 * this prompt swallows the close silently: the tab stays, nothing appears, and
 * the parked request makes every later attempt on that tab a no-op.
 *
 * The decision it drives is the same on a phone as on a desktop, and it is not
 * a small one — a settings tab answers through the settings store, an editor
 * through the document layer, and a failed settings save deliberately keeps the
 * prompt open so the inline errors can be read. Copying that into a second
 * shell would be copying the part most worth getting wrong only once.
 */
export function TabCloseRequest({ shell }: { readonly shell: ShellState }) {
  const { tabState, dispatchTabs } = shell;
  const request = tabState.closeRequest;
  if (!request) return null;

  const tab = tabState.tabs.find((candidate) => candidate.id === request.tabId) ?? null;

  return (
    <DirtyCloseDialog
      tab={tab}
      onCancel={() => dispatchTabs({ type: "cancelClose", tabId: request.tabId })}
      onDiscard={() => {
        // For settings tabs, clear staged changes so the store doesn't stay
        // dirty after discarding. Editor tabs have no staged settings state.
        if (tab?.kind === "settings") {
          useSettingsStore.getState().resetStaged();
        }
        dispatchTabs({ type: "discardClose", tabId: request.tabId });
      }}
      onSave={async () => {
        if (!tab) return;
        // Settings tabs save through the settings store, not saveDocument.
        if (tab.kind === "settings") {
          const result = await useSettingsStore.getState().saveSettings();
          // On success, close the tab. On validation failure, leave the
          // dialog open so the user sees inline errors in the settings tab.
          if (result.success) {
            dispatchTabs({ type: "completeSaveAndClose", tabId: tab.id });
          }
          return;
        }
        // Editor tabs save through the document persistence layer.
        if (await shell.saveDocument(tab)) {
          dispatchTabs({ type: "completeSaveAndClose", tabId: tab.id });
        }
      }}
    />
  );
}
