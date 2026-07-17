import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { markdown } from "@codemirror/lang-markdown";
import { defaultHighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { EditorState } from "@codemirror/state";
import { keymap } from "@codemirror/view";
import { Button } from "@thinkbrain/ui";
import { EditorView } from "codemirror";
import { useCallback, useEffect, useRef } from "react";

import { normalizeNativeError } from "../native/commands";
import { indexDocument } from "../search/searchService";
import {
  type ActiveDocumentState,
  useAppStore
} from "../stores/appStore";
import { writeMarkdownFile } from "../workspace/workspaceService";
import styles from "./MarkdownEditor.module.css";
import sharedStyles from "../styles/shared.module.css";

export function MarkdownEditor() {
  const activeDocument = useAppStore((state) => state.activeDocument);
  const updateActiveDocumentContents = useAppStore(
    (state) => state.updateActiveDocumentContents
  );
  const setActiveDocumentSaving = useAppStore(
    (state) => state.setActiveDocumentSaving
  );
  const markActiveDocumentSaved = useAppStore(
    (state) => state.markActiveDocumentSaved
  );
  const setActiveDocumentError = useAppStore(
    (state) => state.setActiveDocumentError
  );
  const setWorkspaceFiles = useAppStore((state) => state.setWorkspaceFiles);
  const editorHostRef = useRef<HTMLDivElement | null>(null);
  const editorViewRef = useRef<EditorView | null>(null);
  const latestEditorContentsRef = useRef("");
  const saveRef = useRef<() => void>(() => undefined);
  const syncingFromStoreRef = useRef(false);
  const activeFile = activeDocument.file;
  const activeFileRootPath = activeFile?.rootPath ?? null;
  const activeFileRelativePath = activeFile?.relativePath ?? null;
  const isLoading = activeDocument.status === "loading";

  /**
   * Saves the latest active-document snapshot without parsing or serializing it.
   *
   * The editor may update after the button renders, so this reads from the store
   * at save time and marks that exact text as the saved baseline on success.
   */
  const saveActiveDocument = useCallback(async () => {
    const documentSnapshot = useAppStore.getState().activeDocument;

    if (
      !documentSnapshot.file ||
      !documentSnapshot.isDirty ||
      documentSnapshot.status === "loading" ||
      documentSnapshot.status === "saving"
    ) {
      return;
    }

    const file = documentSnapshot.file;
    const contentsToSave = documentSnapshot.editorContents;

    try {
      setActiveDocumentSaving();
      const updatedFile = await writeMarkdownFile(
        file.rootPath,
        file.relativePath,
        contentsToSave
      );

      markActiveDocumentSaved(contentsToSave);

      const workspaceSnapshot = useAppStore.getState().workspace;
      if (
        workspaceSnapshot.status === "ready" &&
        workspaceSnapshot.workspace.rootPath === file.rootPath
      ) {
        setWorkspaceFiles(
          workspaceSnapshot.files.map((candidate) =>
            candidate.relativePath === updatedFile.relativePath
              ? updatedFile
              : candidate
          )
        );
      }

      // Keep search fresh by upserting just the saved note. A failure here must
      // not fail the save, so surface it through the (non-blocking) index state.
      try {
        await indexDocument(file.rootPath, updatedFile, contentsToSave);
      } catch (indexError) {
        useAppStore
          .getState()
          .setIndexingError(normalizeNativeError(indexError));
      }
    } catch (error) {
      setActiveDocumentError(normalizeNativeError(error));
    }
  }, [
    markActiveDocumentSaved,
    setActiveDocumentError,
    setActiveDocumentSaving,
    setWorkspaceFiles
  ]);

  useEffect(() => {
    saveRef.current = () => {
      void saveActiveDocument();
    };
  }, [saveActiveDocument]);

  useEffect(() => {
    latestEditorContentsRef.current = activeDocument.editorContents;
  }, [activeDocument.editorContents]);

  useEffect(() => {
    if (!editorHostRef.current || !activeFile || isLoading) {
      return;
    }

    const view = new EditorView({
      parent: editorHostRef.current,
      state: EditorState.create({
        doc: latestEditorContentsRef.current,
        extensions: [
          history(),
          markdown(),
          syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
          EditorView.lineWrapping,
          EditorView.updateListener.of((update) => {
            if (!update.docChanged || syncingFromStoreRef.current) {
              return;
            }

            updateActiveDocumentContents(update.state.doc.toString());
          }),
          keymap.of([
            {
              key: "Mod-s",
              preventDefault: true,
              run: () => {
                saveRef.current();
                return true;
              }
            },
            ...historyKeymap,
            ...defaultKeymap
          ])
        ]
      })
    });

    editorViewRef.current = view;

    return () => {
      view.destroy();
      editorViewRef.current = null;
    };
  }, [
    activeFile,
    activeFileRelativePath,
    activeFileRootPath,
    isLoading,
    updateActiveDocumentContents
  ]);

  useEffect(() => {
    const view = editorViewRef.current;

    if (!view) {
      return;
    }

    const currentContents = view.state.doc.toString();
    if (currentContents === activeDocument.editorContents) {
      return;
    }

    syncingFromStoreRef.current = true;
    view.dispatch({
      changes: {
        from: 0,
        to: currentContents.length,
        insert: activeDocument.editorContents
      }
    });
    syncingFromStoreRef.current = false;
  }, [activeDocument.editorContents]);

  if (!activeDocument.file) {
    return null;
  }

  const canSave =
    activeDocument.isDirty &&
    activeDocument.status !== "loading" &&
    activeDocument.status !== "saving";

  return (
    <div className={styles.markdownEditor}>
      <header className={styles.toolbar}>
        <div className={styles.titleBlock}>
          <p className={sharedStyles.eyebrow}>Markdown editor</p>
          <h2 id="editor-area-title">{activeDocument.file.fileName}</h2>
          <p>{activeDocument.file.relativePath}</p>
        </div>
        <div className={styles.actions}>
          <span className={styles.status} role="status">
            {getDocumentStatusText(activeDocument)}
          </span>
          <Button
            disabled={!canSave}
            onClick={() => {
              void saveActiveDocument();
            }}
          >
            {activeDocument.status === "saving" ? "Saving..." : "Save"}
          </Button>
        </div>
      </header>

      {activeDocument.error ? (
        <div className={styles.error} role="alert">
          <strong>{activeDocument.error.code}</strong>
          <span>{activeDocument.error.message}</span>
        </div>
      ) : null}

      {activeDocument.status === "loading" ? (
        <div className={styles.loading} role="status">
          Opening note...
        </div>
      ) : (
        <div
          ref={editorHostRef}
          className={styles.surface}
          aria-label={`Markdown editor for ${activeDocument.file.fileName}`}
        />
      )}
    </div>
  );
}

function getDocumentStatusText(document: ActiveDocumentState): string {
  if (document.status === "loading") {
    return "Opening...";
  }

  if (document.status === "saving") {
    return "Saving...";
  }

  if (document.status === "error") {
    return document.isDirty ? "Error, unsaved changes" : "Error";
  }

  return document.isDirty ? "Unsaved changes" : "Saved";
}
