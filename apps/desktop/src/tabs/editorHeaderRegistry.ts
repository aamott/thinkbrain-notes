import {
  createContributionRegistry,
  type ContributionRegistry,
  type IdentifiedContribution
} from "@thinkbrain/core";
import type { ReactNode } from "react";

/**
 * Contributions rendered above the Markdown editor body (D44).
 *
 * A first-class React slot rather than a CodeMirror panel: contributions are
 * ordinary components, and CodeMirror keeps owning only its own DOM. The
 * registry is observable so a contribution registered *after* an editor mounts
 * reaches it — extensions activate lazily, long after a document is open.
 */

/** What a header contribution may read about the open document. Read-only. */
export interface EditorHeaderContext {
  readonly rootPath: string | null;
  /** Workspace-relative path, or `null` for a document with no file yet. */
  readonly relativePath: string | null;
  readonly contents: string;
  /**
   * Replaces the open document's text.
   *
   * Edits go through the editor, not the file: the user's unsaved changes and
   * their Save are the editor's business, and writing underneath it would race
   * whatever they are typing.
   */
  readonly applyEdit?: (contents: string) => void;
}

export interface DesktopEditorHeaderContribution extends IdentifiedContribution {
  /** Names the region for assistive technology. */
  readonly label: string;
  /** Limits the contribution to documents it belongs on. Absent means always. */
  readonly applies?: (context: EditorHeaderContext) => boolean;
  readonly render: (context: EditorHeaderContext) => ReactNode;
}

export type DesktopEditorHeaderRegistry =
  ContributionRegistry<DesktopEditorHeaderContribution>;

/**
 * Creates a fresh editor-header registry.
 *
 * The core registry supplies ordered storage, loud duplicate rejection, and
 * subscription; nothing here needs to add to it.
 */
export function createDesktopEditorHeaderRegistry(
  initialHeaders: readonly DesktopEditorHeaderContribution[] = []
): DesktopEditorHeaderRegistry {
  return createContributionRegistry(initialHeaders);
}

/** Shared first-party registry consumed by the Markdown editor. */
export const desktopEditorHeaderRegistry = createDesktopEditorHeaderRegistry();
