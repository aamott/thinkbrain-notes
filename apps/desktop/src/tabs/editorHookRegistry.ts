import type { Extension } from "@codemirror/state";
import type { KeyBinding } from "@codemirror/view";
import {
  createContributionRegistry,
  type ContributionRegistry,
  type EditorHookContribution
} from "@thinkbrain/core";

/**
 * A desktop editor hook specialized for CodeMirror 6.
 *
 * The payload and context remain host-defined so an editor can provide callbacks
 * and other runtime values without making the platform-neutral core aware of
 * CodeMirror or React.
 */
export type DesktopEditorHookContribution<Payload = void, Context = unknown> =
  EditorHookContribution<Extension, KeyBinding, Payload, Context>;

/**
 * Ordered CodeMirror contribution registry for the desktop editor host.
 *
 * Hooks are looked up by identifier, while assembly runs them by ascending
 * `order`. Registration order is retained for hooks with the same order.
 */
export interface DesktopEditorHookRegistry<Payload = void, Context = unknown>
  extends ContributionRegistry<DesktopEditorHookContribution<Payload, Context>> {
  /** Returns registered hooks ordered for deterministic extension assembly. */
  orderedEntries(): readonly DesktopEditorHookContribution<Payload, Context>[];
  /** Creates the CodeMirror extensions contributed by registered hooks. */
  getExtensions(payload: Payload, context: Context): readonly Extension[];
  /** Creates the CodeMirror keybindings contributed by registered hooks. */
  getKeybindings(payload: Payload, context: Context): readonly KeyBinding[];
}

/**
 * Creates a typed CodeMirror editor hook registry.
 *
 * Duplicate identifiers are rejected by the core registry before a contribution
 * can be added, which prevents an extension from silently replacing a built-in.
 *
 * @param initialContributions Hooks to register in their supplied order.
 * @returns A fresh desktop CodeMirror hook registry.
 */
export function createDesktopEditorHookRegistry<Payload = void, Context = unknown>(
  initialContributions: readonly DesktopEditorHookContribution<Payload, Context>[] = []
): DesktopEditorHookRegistry<Payload, Context> {
  const coreRegistry = createContributionRegistry<
    DesktopEditorHookContribution<Payload, Context>
  >(initialContributions);

  const orderedEntries = (): readonly DesktopEditorHookContribution<Payload, Context>[] =>
    coreRegistry
      .entries()
      .map((contribution, registrationIndex) => ({ contribution, registrationIndex }))
      .sort((left, right) => {
        const orderDifference = left.contribution.order - right.contribution.order;
        return orderDifference === 0
          ? left.registrationIndex - right.registrationIndex
          : orderDifference;
      })
      .map(({ contribution }) => contribution);

  const getExtensions = (payload: Payload, context: Context): readonly Extension[] => {
    const extensions: Extension[] = [];
    for (const contribution of orderedEntries()) {
      if (contribution.extensions) {
        extensions.push(...contribution.extensions(payload, context));
      }
    }
    return extensions;
  };

  const getKeybindings = (payload: Payload, context: Context): readonly KeyBinding[] => {
    const keybindings: KeyBinding[] = [];
    for (const contribution of orderedEntries()) {
      if (contribution.keybindings) {
        keybindings.push(...contribution.keybindings(payload, context));
      }
    }
    return keybindings;
  };

  return {
    register: coreRegistry.register,
    get: coreRegistry.get,
    entries: coreRegistry.entries,
    orderedEntries,
    getExtensions,
    getKeybindings
  };
}
