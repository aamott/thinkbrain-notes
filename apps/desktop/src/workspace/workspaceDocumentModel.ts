import {
  normalizeNativeError,
  type NativeMarkdownFileContents,
  type NativeMarkdownFileEntry,
  type NativeTextFileContents
} from "../native/commands";
import type {
  WorkspaceDocumentApi,
  WorkspaceMarkdownDocumentRef,
  WorkspaceMarkdownDocumentWrite
} from "./workspaceDocumentAdapter";
import type { TextFileApi, TextFileRef, TextFileWrite } from "./textFileAdapter";

/** Shared result shape for both Markdown and text file load/save operations. */
export type FileOperationResult =
  | { readonly ok: true; readonly document: NativeMarkdownFileContents | NativeTextFileContents }
  /**
   * The code travels with the message because not every failure means the same
   * thing to the caller. A refused save is a question for the user; a failed one
   * is an error to report. Nothing in the message distinguishes them.
   */
  | { readonly ok: false; readonly message: string; readonly code: string };

/** @deprecated Use {@link FileOperationResult}. */
export type WorkspaceDocumentResult = FileOperationResult;
/** @deprecated Use {@link FileOperationResult}. */
export type TextFileResult = FileOperationResult;

/** Loads a Markdown document through an injected desktop boundary. */
export async function loadWorkspaceDocument(
  api: WorkspaceDocumentApi,
  request: WorkspaceMarkdownDocumentRef
): Promise<FileOperationResult> {
  try {
    return { ok: true, document: await api.readMarkdownDocument(request) };
  } catch (error) {
    return fileOperationFailure(error, "The Markdown document could not be updated.");
  }
}

/** Saves the caller's contents and returns the canonical native relative path. */
export async function saveWorkspaceDocument(
  api: WorkspaceDocumentApi,
  request: WorkspaceMarkdownDocumentWrite
): Promise<FileOperationResult> {
  try {
    const entry = await api.writeMarkdownDocument(request);
    return { ok: true, document: documentFromEntry(entry, request.contents) };
  } catch (error) {
    return fileOperationFailure(error, "The Markdown document could not be updated.");
  }
}

export function workspaceDocumentErrorMessage(error: unknown): string {
  return normalizeNativeError(error).message.trim() || "The Markdown document could not be updated.";
}

/** Loads a non-Markdown text file through the text file API. */
export async function loadTextFile(
  api: TextFileApi,
  request: TextFileRef
): Promise<FileOperationResult> {
  try {
    return { ok: true, document: await api.readTextFile(request) };
  } catch (error) {
    return fileOperationFailure(error, "The file could not be updated.");
  }
}

/** Saves a non-Markdown text file and returns the canonical relative path. */
export async function saveTextFile(
  api: TextFileApi,
  request: TextFileWrite
): Promise<FileOperationResult> {
  try {
    const entry = await api.writeTextFile(request);
    return { ok: true, document: { relative_path: entry.relative_path, contents: request.contents } };
  } catch (error) {
    return fileOperationFailure(error, "The file could not be updated.");
  }
}

/**
 * The one place a failure result is built, so no path can carry a message
 * without the code that tells the caller what to do about it.
 */
function fileOperationFailure(error: unknown, fallbackMessage: string): FileOperationResult {
  const normalized = normalizeNativeError(error);
  return {
    ok: false,
    message: normalized.message.trim() || fallbackMessage,
    code: normalized.code
  };
}

function documentFromEntry(
  entry: NativeMarkdownFileEntry,
  contents: string
): NativeMarkdownFileContents {
  return { relative_path: entry.relative_path, contents };
}
