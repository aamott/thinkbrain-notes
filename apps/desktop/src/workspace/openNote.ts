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
  useAppStore.getState().openActiveDocument(file);

  try {
    const loaded = await readMarkdownFile(file.rootPath, file.relativePath);

    if (isActiveDocument(file)) {
      useAppStore.getState().setActiveDocumentLoaded(loaded.contents);
    }
  } catch (error) {
    if (isActiveDocument(file)) {
      useAppStore.getState().setActiveDocumentError(normalizeNativeError(error));
    }
  }
}

function isActiveDocument(file: {
  readonly rootPath: string;
  readonly relativePath: string;
}): boolean {
  const activeFile = useAppStore.getState().activeDocument.file;

  return (
    activeFile?.rootPath === file.rootPath &&
    activeFile.relativePath === file.relativePath
  );
}
