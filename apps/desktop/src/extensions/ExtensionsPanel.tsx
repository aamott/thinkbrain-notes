import { useSyncExternalStore } from "react";

import { getExtensionBootstrap, type BootstrapEntry } from "./bootstrapRef";

const EMPTY: readonly BootstrapEntry[] = [];

const subscribe = (listener: () => void): (() => void) =>
  getExtensionBootstrap()?.subscribe(listener) ?? (() => undefined);

const snapshot = (): readonly BootstrapEntry[] => getExtensionBootstrap()?.entries() ?? EMPTY;

/**
 * Lists installed extensions and their live status.
 *
 * Reads the bootstrap on each render rather than subscribing: statuses change
 * only when an extension activates, and activating one always comes from a user
 * action that re-renders the shell.
 */
export interface ExtensionsPanelProps {
  /** Injected by tests; defaults to the app-wide bootstrap. */
  readonly entries?: readonly BootstrapEntry[];
}

const STATUS_LABELS: Record<BootstrapEntry["status"], string> = {
  registered: "Not started",
  activating: "Starting…",
  active: "Active",
  deactivating: "Stopping…",
  inactive: "Stopped",
  failed: "Failed",
  incompatible: "Incompatible"
};

export function ExtensionsPanel({ entries }: ExtensionsPanelProps) {
  // Subscribed rather than read once: an extension activates from a different
  // panel, and this list must not keep claiming it has not started.
  const live = useSyncExternalStore(subscribe, snapshot, snapshot);
  const resolved = entries ?? live;

  if (resolved.length === 0) {
    return (
      <div className="p-4">
        <p className="m-0 text-muted-foreground text-xs">No extensions are installed.</p>
      </div>
    );
  }

  return (
    <ul className="m-0 list-none p-2" aria-label="Installed extensions">
      {resolved.map((entry) => (
        <li key={entry.id} className="rounded-small px-2 py-2">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-foreground text-sm">{entry.name}</span>
            <span className="text-muted-foreground text-[0.6875rem]" data-status={entry.status}>
              {STATUS_LABELS[entry.status]}
            </span>
          </div>
          <p className="m-0 text-muted-foreground text-[0.6875rem]">{entry.id}</p>
          {entry.reasons.length > 0 && (
            <ul className="m-0 mt-1 list-none p-0">
              {entry.reasons.map((reason) => (
                <li
                  key={`${reason.code}:${reason.message}`}
                  className="text-[0.6875rem] text-danger"
                >
                  {reason.message}
                </li>
              ))}
            </ul>
          )}
        </li>
      ))}
    </ul>
  );
}
