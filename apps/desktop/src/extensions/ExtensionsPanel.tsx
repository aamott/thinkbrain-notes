import { useCallback, useState, useSyncExternalStore } from "react";
import { getErrorMessage } from "@thinkbrain/core";

import { pickDirectoryPath } from "../native/dialogs";
import { getExtensionBootstrap, type BootstrapEntry } from "./bootstrapRef";
import { getLocalExtensions } from "./localExtensionsRef";
import type { LoadOutcome, LocalExtensions, StartupFailure } from "./localExtensions";

const EMPTY: readonly BootstrapEntry[] = [];
const NO_FAILURES: readonly StartupFailure[] = [];

/**
 * How often and how long a missing source is re-checked. The bootstrap and
 * controller refs are module globals published during startup; a panel that
 * mounts before that attaches to nothing, and without a re-check it would
 * show `empty` forever — a `useSyncExternalStore` listener attached to no
 * source gives React no reason to re-render. The budget is bounded so a
 * source that never arrives costs a handful of timers, not a permanent poll.
 */
const LATE_SOURCE_CHECK_MS = 100;
const LATE_SOURCE_CHECKS = 100;

/** Anything in the extensions layer that publishes a slice by subscription. */
interface SubscribedSliceSource {
  subscribe(listener: () => void): () => void;
}

/**
 * Subscribes to a lazily-available source (absent until bootstrap wires it) and
 * reads `empty` while it is missing.
 */
function useSubscribedSlice<S extends SubscribedSliceSource, T>(
  getSource: () => S | null | undefined,
  read: (source: S) => T,
  empty: T
): T {
  // Memoized on the (stable module-level) getter: a fresh subscribe identity
  // every render would make useSyncExternalStore detach and re-attach on
  // every render.
  const subscribe = useCallback(
    (listener: () => void): (() => void) => {
      let detach: (() => void) | undefined;
      let timer: ReturnType<typeof setTimeout> | undefined;
      let checks = 0;

      const attach = (): void => {
        const source = getSource();
        if (source === null || source === undefined) {
          if (checks < LATE_SOURCE_CHECKS) {
            checks += 1;
            timer = setTimeout(attach, LATE_SOURCE_CHECK_MS);
          }
          return;
        }
        detach = source.subscribe(() => {
          if (getSource() !== source) {
            // The ref was republished under us — drop the stale subscription
            // and follow the new source.
            detach?.();
            attach();
            return;
          }
          listener();
        });
        // The source may already hold a slice worth showing; re-reading now
        // beats waiting for its next notification.
        listener();
      };

      attach();
      return () => {
        detach?.();
        if (timer !== undefined) clearTimeout(timer);
      };
    },
    [getSource]
  );

  return useSyncExternalStore(
    subscribe,
    () => {
      const source = getSource();
      return source ? read(source) : empty;
    },
    () => empty
  );
}

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
  const live = useSubscribedSlice(
    getExtensionBootstrap,
    (bootstrap) => bootstrap.entries(),
    EMPTY
  );
  const resolved = entries ?? live;
  const startupFailures = useSubscribedSlice(
    getLocalExtensions,
    (local) => local.startupFailures(),
    NO_FAILURES
  );
  const [errors, setErrors] = useState<readonly string[]>([]);
  const [busy, setBusy] = useState(false);

  // Stored directories that failed to load at startup stay stored so the user
  // can fix them; they are reported here alongside interactive load errors.
  const startupErrors = startupFailures.flatMap((failure) =>
    failure.diagnostics
      .filter((diagnostic) => diagnostic.severity === "error")
      .map((diagnostic) => `${failure.directory}: ${diagnostic.message}`)
  );
  const allErrors = [...startupErrors, ...errors];

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
        setErrors([getErrorMessage(error)]);
      } finally {
        setBusy(false);
      }
    },
    [report]
  );

  // Same guard as `onAdd`, but loud: a missing controller with a clickable
  // Reload/Remove is a wiring bug, so surface it as an error rather than
  // silently no-op or throw a bare "cannot read properties of null".
  const runLocal = useCallback(
    (action: (local: LocalExtensions) => Promise<LoadOutcome | void>): Promise<void> =>
      run(() => {
        const local = getLocalExtensions();
        if (!local) throw new Error("Local extension management is not available.");
        return action(local);
      }),
    [run]
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
          className="cursor-pointer rounded-small border border-border bg-transparent px-2 py-1 text-foreground text-[0.6875rem] disabled:opacity-50"
          onClick={() => void onAdd()}
          disabled={busy}
        >
          Add from folder…
        </button>
      </div>

      {allErrors.length > 0 && (
        // role="alert" so a failure that appears after an action is announced;
        // index in the key because two diagnostics may share a message.
        <ul role="alert" className="m-0 list-none border-b border-border p-2" aria-label="Extension load errors">
          {allErrors.map((message, index) => (
            <li key={`${index}-${message}`} className="text-[0.6875rem] text-danger">
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
        <ul data-phone-scroll-clearance className="m-0 list-none overflow-y-auto p-2" aria-label="Installed extensions">
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
                      className="cursor-pointer border-0 bg-transparent p-0 text-[0.6875rem] text-accent underline disabled:opacity-50"
                      onClick={() => void runLocal((local) => local.reload(entry.id))}
                      disabled={busy}
                    >
                      Reload {entry.name}
                    </button>
                    <button
                      type="button"
                      className="cursor-pointer border-0 bg-transparent p-0 text-[0.6875rem] text-accent underline disabled:opacity-50"
                      onClick={() => void runLocal((local) => local.remove(entry.id))}
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
