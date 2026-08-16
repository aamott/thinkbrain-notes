import {
  normalizeNativeError,
  type NativeMarkdownFileContents,
  type NativeMarkdownFileEntry
} from "../native/commands";
import type {
  WorkspaceDocumentApi,
  WorkspaceMarkdownDocumentRef,
  WorkspaceMarkdownDocumentWrite
} from "./workspaceDocumentAdapter";

export type WorkspaceDocumentResult =
  | { readonly ok: true; readonly document: NativeMarkdownFileContents }
  /**
   * The code travels with the message because not every failure means the same
   * thing to the caller. A refused save is a question for the user; a failed one
   * is an error to report. Nothing in the message distinguishes them.
   */
  | { readonly ok: false; readonly message: string; readonly code: string };

/** Loads a Markdown document through an injected desktop boundary. */
export async function loadWorkspaceDocument(
  api: WorkspaceDocumentApi,
  request: WorkspaceMarkdownDocumentRef
): Promise<WorkspaceDocumentResult> {
  try {
    return { ok: true, document: await api.readMarkdownDocument(request) };
  } catch (error) {
    return workspaceDocumentFailure(error);
  }
}

/** Saves the caller's contents and returns the canonical native relative path. */
export async function saveWorkspaceDocument(
  api: WorkspaceDocumentApi,
  request: WorkspaceMarkdownDocumentWrite
): Promise<WorkspaceDocumentResult> {
  try {
    const entry = await api.writeMarkdownDocument(request);
    return { ok: true, document: documentFromEntry(entry, request.contents) };
  } catch (error) {
    return workspaceDocumentFailure(error);
  }
}

export function workspaceDocumentErrorMessage(error: unknown): string {
  const normalized = normalizeNativeError(error);
  return normalized.message.trim() || "The Markdown document could not be updated.";
}

/**
 * The one place a failure result is built, so no path can carry a message
 * without the code that tells the caller what to do about it.
 */
function workspaceDocumentFailure(error: unknown): WorkspaceDocumentResult {
  return {
    ok: false,
    message: workspaceDocumentErrorMessage(error),
    code: normalizeNativeError(error).code
  };
}

function documentFromEntry(
  entry: NativeMarkdownFileEntry,
  contents: string
): NativeMarkdownFileContents {
  return { relative_path: entry.relative_path, contents };
}
