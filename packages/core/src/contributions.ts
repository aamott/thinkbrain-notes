/**
 * Platform-agnostic contribution contracts and registries.
 *
 * Applications provide their own view, editor-extension, and keybinding types
 * when they consume these contracts. This module intentionally has no knowledge
 * of a UI toolkit, editor implementation, or host platform.
 */

import type { Disposable } from "./lifecycle";

/** A contribution with the identifier used for registry lookup. */
export interface IdentifiedContribution {
  /** Stable identifier unique within a registry. */
  readonly id: string;
}

/**
 * An ordered registry for contributions of one type.
 *
 * Registration order is preserved by {@link ContributionRegistry.entries}. A
 * registry rejects duplicate identifiers immediately rather than silently
 * replacing the earlier contribution.
 */
export interface ContributionRegistry<T extends IdentifiedContribution> {
  /** Registers a contribution and returns a handle that unregisters that contribution. */
  register(contribution: T): Disposable;
  /** Returns the contribution for an identifier, or `undefined` when absent. */
  get(id: string): T | undefined;
  /** Returns a defensive copy of contributions in registration order. */
  entries(): readonly T[];
}

/**
 * Creates an ordered contribution registry.
 *
 * Initial contributions are registered in array order and are subject to the
 * same duplicate-identifier checks as later registrations.
 *
 * @param initialContributions Contributions to register before returning.
 * @returns A fresh registry containing the initial contributions.
 */
export function createContributionRegistry<T extends IdentifiedContribution>(
  initialContributions: readonly T[] = []
): ContributionRegistry<T> {
  const contributions = new Map<string, T>();
  const order: string[] = [];

  const register = (contribution: T): Disposable => {
    if (contributions.has(contribution.id)) {
      throw new Error(
        `A contribution is already registered for id "${contribution.id}".`
      );
    }

    contributions.set(contribution.id, contribution);
    order.push(contribution.id);
    let disposed = false;

    return {
      dispose: (): void => {
        if (disposed) {
          return;
        }
        disposed = true;
        if (contributions.get(contribution.id) === contribution) {
          contributions.delete(contribution.id);
          const index = order.indexOf(contribution.id);
          if (index >= 0) {
            order.splice(index, 1);
          }
        }
      }
    };
  };

  for (const contribution of initialContributions) {
    register(contribution);
  }

  return {
    register,
    get: (id: string): T | undefined => contributions.get(id),
    entries: (): readonly T[] => order.map((id) => contributions.get(id)!),
  };
}

/** A command handler result; commands may complete synchronously or asynchronously. */
export type CommandHandler<Payload = void> = (
  payload: Payload
) => void | Promise<void>;

/** A command exposed to the application command palette or keybinding layer. */
export interface CommandContribution<Payload = void>
  extends IdentifiedContribution {
  /** Human-readable command name. */
  readonly title: string;
  /** Optional platform-specific keybinding expression. Display + future global binding; not yet bound globally by the host. */
  readonly keybinding?: string;
  /** Invoked by the host after it supplies the command payload. */
  readonly handler: CommandHandler<Payload>;
}

/** Produces a panel view for a host-defined context. */
export type PanelFactory<View, Context> = (context: Context) => View;

/** A registered activity/sidebar panel without a UI-framework dependency. */
export interface PanelContribution<View, Context = unknown>
  extends IdentifiedContribution {
  /** Human-readable panel label. */
  readonly label: string;
  /** Host-defined icon identifier, not an icon component. */
  readonly icon: string;
  /** Side on which the panel is placed. */
  readonly side: "left" | "right";
  /** Creates the host-specific panel view. */
  readonly factory: PanelFactory<View, Context>;
  /** Determines whether the panel's backing capability is currently usable. Advisory metadata emitted as `data-panel-available`; factories own their unavailable-state rendering. */
  readonly availability?: (context: Context) => boolean;
}

/** Produces editor extensions from host-defined payload and context values. */
export type EditorExtensionFactory<Extension, Payload = void, Context = unknown> = (
  payload: Payload,
  context: Context
) => readonly Extension[];

/** Produces editor keybindings from host-defined payload and context values. */
export type EditorKeybindingFactory<
  Keybinding,
  Payload = void,
  Context = unknown
> = (payload: Payload, context: Context) => readonly Keybinding[];

/**
 * A contribution to an editor's extension and keybinding assembly pipeline.
 *
 * Hosts can sort entries by `order` before invoking factories. The registry's
 * own order remains stable and is useful as a deterministic tie-breaker.
 */
export interface EditorHookContribution<
  Extension,
  Keybinding,
  Payload = void,
  Context = unknown
> extends IdentifiedContribution {
  /** Lower values run first; equal values retain registration order. */
  readonly order: number;
  /** Factory for host-specific editor extensions. */
  readonly extensions?: EditorExtensionFactory<Extension, Payload, Context>;
  /** Factory for host-specific editor keybindings. */
  readonly keybindings?: EditorKeybindingFactory<Keybinding, Payload, Context>;
}
