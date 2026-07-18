import { normalizeNativeError } from "../native/commands";
import { indexDocument } from "../search/searchService";
import { useAppStore } from "../stores/appStore";
import { writeMarkdownFile } from "../workspace/workspaceService";

/** Saves the active editor-tab snapshot for the toolbar and close confirmation. */
export async function saveActiveDocument(): Promise<boolean> {
  const store = useAppStore.getState();
  const documentSnapshot = store.activeDocument;
  const tabId = store.tabState.activeTabId;

  if (
    !tabId ||
    !documentSnapshot.file ||
    !documentSnapshot.isDirty ||
    documentSnapshot.status === "loading" ||
    documentSnapshot.status === "saving"
  ) {
    return false;
  }

  const file = documentSnapshot.file;
  const contentsToSave = documentSnapshot.editorContents;

  try {
    store.setDocumentSaving(tabId);
    const updatedFile = await writeMarkdownFile(
      file.rootPath,
      file.relativePath,
      contentsToSave
    );

    useAppStore.getState().markDocumentSaved(tabId, contentsToSave);

    const workspaceSnapshot = useAppStore.getState().workspace;
    if (
      workspaceSnapshot.status === "ready" &&
      workspaceSnapshot.workspace.rootPath === file.rootPath
    ) {
      useAppStore.getState().setWorkspaceFiles(
        workspaceSnapshot.files.map((candidate) =>
          candidate.relativePath === updatedFile.relativePath
            ? updatedFile
            : candidate
        )
      );
    }

    // Indexing is recoverable and must not turn a successful write into a failure.
    try {
      await indexDocument(file.rootPath, updatedFile, contentsToSave);
    } catch (indexError) {
      useAppStore.getState().setIndexingError(normalizeNativeError(indexError));
    }

    return !useAppStore.getState().editorDocuments[tabId]?.isDirty;
  } catch (error) {
    useAppStore.getState().setDocumentError(tabId, normalizeNativeError(error));
    return false;
  }
}
