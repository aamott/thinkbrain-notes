import { useCallback, useState, useSyncExternalStore } from "react";

import { pickDirectoryPath } from "../native/dialogs";
import { getExtensionBootstrap, type BootstrapEntry } from "./bootstrapRef";
import { getLocalExtensions } from "./localExtensionsRef";
import type { LoadOutcome } from "./localExtensions";

const EMPTY: readonly BootstrapEntry[] = [];

const subscribe = (listener: () => void): (() => void) =>
  getExtensionBootstrap()?.subscribe(listener) ?? (() => undefined);

const snapshot = (): readonly BootstrapEntry[] => getExtensionBootstrap()?.entries() ?? EMPTY;

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

/**
 * Lists installed extensions and their live status, and loads development
 * extensions from a local directory.
 *
 * Subscribed rather than read once: an extension activates from a different
 * panel, and this list must not keep claiming it has not started.
 */
export function ExtensionsPanel({ entries }: ExtensionsPanelProps) {
  const live = useSyncExternalStore(subscribe, snapshot, snapshot);
  const resolved = entries ?? live;
  const [errors, setErrors] = useState<readonly string[]>([]);
  const [busy, setBusy] = useState(false);

  const report = useCallback((outcome: LoadOutcome): void => {
    setErrors(
      outcome.diagnostics
        .filter((diagnostic) => diagnostic.severity === "error")
        .map((diagnostic) => diagnostic.message)
    );
  }, []);

  const run = useCallback(
    async (action: () => Promise<LoadOutcome | void>): Promise<void> => {
      setBusy(true);
      try {
        const outcome = await action();
        if (outcome) report(outcome);
        else setErrors([]);
      } catch (error: unknown) {
        setErrors([error instanceof Error ? error.message : String(error)]);
      } finally {
        setBusy(false);
      }
    },
    [report]
  );

  const onAdd = useCallback(async (): Promise<void> => {
    const local = getLocalExtensions();
    if (!local) return;

    const directory = await pickDirectoryPath("Select an extension directory");
    if (!directory) return;

    // Trusted same-context execution: the extension runs with the same
    // privileges as the app itself. This is stated plainly and is not a
    // sandbox prompt — nothing here restricts what the extension can do.
    const confirmed = window.confirm(
      `Load the extension in "${directory}"?\n\n` +
        "It runs with full application privileges: it can read and change your notes, " +
        "settings, and files. Only load directories you trust."
    );
    if (!confirmed) return;

    await run(() => local.add(directory));
  }, [run]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center justify-between gap-2 border-b border-border px-2 py-2">
        <p className="m-0 text-muted-foreground text-[0.6875rem]">
          Development extensions run with full app privileges.
        </p>
        <button
          type="button"
          className="cursor-pointer rounded-small border border-border bg-transparent px-2 py-1 text-foreground text-[0.6875rem] disabled:cursor-default disabled:opacity-50"
          onClick={() => void onAdd()}
          disabled={busy}
        >
          Add from folder…
        </button>
      </div>

      {errors.length > 0 && (
        <ul className="m-0 list-none border-b border-border p-2" aria-label="Extension load errors">
          {errors.map((message) => (
            <li key={message} className="text-[0.6875rem] text-danger">
              {message}
            </li>
          ))}
        </ul>
      )}

      {resolved.length === 0 ? (
        <div className="p-4">
          <p className="m-0 text-muted-foreground text-xs">No extensions are installed.</p>
        </div>
      ) : (
        <ul className="m-0 list-none overflow-y-auto p-2" aria-label="Installed extensions">
          {resolved.map((entry) => (
            <li key={entry.id} className="rounded-small px-2 py-2">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-foreground text-sm">{entry.name}</span>
                <span
                  className="text-muted-foreground text-[0.6875rem]"
                  data-status={entry.status}
                >
                  {STATUS_LABELS[entry.status]}
                </span>
              </div>
              <p className="m-0 text-muted-foreground text-[0.6875rem]">{entry.id}</p>

              {entry.source === "local-directory" && (
                <>
                  <p className="m-0 truncate text-muted-foreground text-[0.6875rem]" title={entry.directory}>
                    {entry.directory}
                  </p>
                  <div className="mt-1 flex gap-2">
                    <button
                      type="button"
                      className="cursor-pointer border-0 bg-transparent p-0 text-[0.6875rem] text-accent underline disabled:cursor-default disabled:opacity-50"
                      onClick={() => void run(() => getLocalExtensions()!.reload(entry.id))}
                      disabled={busy}
                    >
                      Reload {entry.name}
                    </button>
                    <button
                      type="button"
                      className="cursor-pointer border-0 bg-transparent p-0 text-[0.6875rem] text-accent underline disabled:cursor-default disabled:opacity-50"
                      onClick={() => void run(() => getLocalExtensions()!.remove(entry.id))}
                      disabled={busy}
                    >
                      Remove {entry.name}
                    </button>
                  </div>
                </>
              )}

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
      )}
    </div>
  );
}
