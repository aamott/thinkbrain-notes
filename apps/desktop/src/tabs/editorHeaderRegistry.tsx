import { useSyncExternalStore } from "react";
import {
  type DesktopEditorHeaderContribution,
  type DesktopEditorHeaderRegistry,
  type EditorHeaderContext,
  desktopEditorHeaderRegistry
} from "./editorHeaderRegistry";

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
