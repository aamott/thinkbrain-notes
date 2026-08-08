import {
  createContributionRegistry,
  type ContributionRegistry,
  type IdentifiedContribution
} from "@thinkbrain/core";
import { useSyncExternalStore, type ReactNode } from "react";

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

/** Subscribes to a registry's contributions for the lifetime of a component. */
function useEditorHeaders(
  registry: DesktopEditorHeaderRegistry
): readonly DesktopEditorHeaderContribution[] {
  // `entries()` returns a stable frozen snapshot until the registry changes,
  // which is exactly the contract useSyncExternalStore needs.
  return useSyncExternalStore(registry.subscribe, registry.entries, registry.entries);
}

/**
 * Renders every contribution that applies to the open document.
 *
 * Renders nothing at all when none applies, so an editor with no contributions
 * shows no empty strip above its text.
 */
export function EditorHeaderSlot({
  context,
  registry = desktopEditorHeaderRegistry
}: {
  readonly context: EditorHeaderContext;
  readonly registry?: DesktopEditorHeaderRegistry;
}) {
  const headers = useEditorHeaders(registry);
  const applicable = headers.filter((header) => header.applies?.(context) ?? true);
  if (applicable.length === 0) return null;

  return (
    <>
      {applicable.map((header) => (
        <section key={header.id} aria-label={header.label} data-editor-header={header.id}>
          {header.render(context)}
        </section>
      ))}
    </>
  );
}
