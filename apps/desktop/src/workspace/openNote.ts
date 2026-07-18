import { normalizeNativeError } from "../native/commands";
import { type ActiveDocumentFile, useAppStore } from "../stores/appStore";
import { readMarkdownFile } from "./workspaceService";

/**
 * Loads a workspace note into the active-document state.
 *
 * Mirrors the explorer's open flow so search results open notes through the
 * exact same active-document lifecycle. Guards against races by only applying
 * results when the requested file is still the active document.
 *
 * Args:
 *   file: The workspace file to open in the editor.
 */
export async function openNoteDocument(file: ActiveDocumentFile): Promise<void> {
  const existingTab = useAppStore.getState().tabState.tabs.find(
    (tab) =>
      tab.kind === "editor" &&
      tab.resource?.rootPath === file.rootPath &&
      tab.resource.relativePath === file.relativePath
  );

  if (existingTab) {
    useAppStore.getState().activateTab(existingTab.id);
    return;
  }

  useAppStore.getState().openActiveDocument(file);
  const tabId = useAppStore.getState().tabState.activeTabId;

  if (!tabId) {
    return;
  }

  try {
    const loaded = await readMarkdownFile(file.rootPath, file.relativePath);

    if (isEditorTabForFile(tabId, file)) {
      useAppStore.getState().setDocumentLoaded(tabId, loaded.contents);
    }
  } catch (error) {
    if (isEditorTabForFile(tabId, file)) {
      useAppStore.getState().setDocumentError(tabId, normalizeNativeError(error));
    }
  }
}

function isEditorTabForFile(
  tabId: string,
  file: {
  readonly rootPath: string;
  readonly relativePath: string;
  }
): boolean {
  const tab = useAppStore
    .getState()
    .tabState.tabs.find((candidate) => candidate.id === tabId);

  return (
    tab?.kind === "editor" &&
    tab.resource?.rootPath === file.rootPath &&
    tab.resource.relativePath === file.relativePath
  );
}
