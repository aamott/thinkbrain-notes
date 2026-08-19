import { useMemo, useSyncExternalStore } from "react";
import {
  type DesktopEditorHeaderRegistry,
  type EditorHeaderContext,
  desktopEditorHeaderRegistry
} from "./editorHeaderRegistry";

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
  // `entries()` returns a stable frozen snapshot until the registry changes,
  // which is exactly the contract useSyncExternalStore needs.
  const headers = useSyncExternalStore(registry.subscribe, registry.entries, registry.entries);
  // Memoize the applies filter: `context.contents` changes on every keystroke,
  // and `applies` callbacks (e.g. `belongsHere`) may parse frontmatter. The
  // filter result is stable for the same (headers, context) pair.
  const applicable = useMemo(
    () => headers.filter((header) => header.applies?.(context) ?? true),
    [headers, context]
  );
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
