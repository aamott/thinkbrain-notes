/**
 * A typed pub/sub bus for app events extensions can react to.
 *
 * The event map type parameter names each event and its payload, so both
 * emitters and subscribers are checked at compile time. Listener failures are
 * isolated: one subscriber throwing must not swallow the event for the rest,
 * which is the reason events route through a bus instead of direct calls.
 */

import type { Disposable } from "../lifecycle";

/** The subscription half of a bus, safe to hand to extensions. */
export interface EventSubscriber<Events> {
  on<Name extends keyof Events & string>(
    event: Name,
    listener: (payload: Events[Name]) => void
  ): Disposable;
}

export interface EventBus<Events> extends EventSubscriber<Events> {
  emit<Name extends keyof Events & string>(event: Name, payload: Events[Name]): void;
}

/** Called when a listener throws; delivery to other listeners continues. */
export type ListenerErrorReporter = (event: string, error: unknown) => void;

/** Core has no host APIs, so the default reporter finds a console at runtime. */
const reportToConsole: ListenerErrorReporter = (event, error) => {
  (globalThis as { console?: { error(...args: unknown[]): void } }).console?.error(
    `[events] A "${event}" listener failed.`,
    error
  );
};

export function createEventBus<Events>(
  onListenerError: ListenerErrorReporter = reportToConsole
): EventBus<Events> {
  const listeners = new Map<string, Set<(payload: never) => void>>();

  return {
    on: (event, listener) => {
      const existing = listeners.get(event) ?? new Set();
      existing.add(listener as (payload: never) => void);
      listeners.set(event, existing);

      return {
        dispose: () => {
          existing.delete(listener as (payload: never) => void);
        }
      };
    },

    emit: (event, payload) => {
      const current = listeners.get(event);
      if (!current) return;

      // Snapshot first: a listener subscribing during delivery must not
      // receive the event that triggered it.
      for (const listener of [...current]) {
        try {
          (listener as (value: typeof payload) => void)(payload);
        } catch (error: unknown) {
          onListenerError(event, error);
        }
      }
    }
  };
}
