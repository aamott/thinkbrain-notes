import { useCallback, useEffect, useState } from "react";

import { createDebounced } from "../lib/debounce";
import { collapsedGroups, loadDesktopState } from "../settings/desktopState";
import {
  persistDesktopState,
  reportDesktopStateReadFailure
} from "../settings/desktopStatePersistence";
import { useSettingsStore } from "../settings/settingsStore";

/**
 * A pause long enough that opening and closing a few groups is one write.
 *
 * Matches the panel-width delay in the shell: the same shape of interaction,
 * and the same reason not to write once per click.
 */
const PERSIST_DELAY_MS = 300;

/** Nothing collapsed. A shared instance, so an empty view keeps one identity. */
const NO_GROUPS: ReadonlySet<string> = new Set();

/** A collapsed set and the workspace it belongs to. */
interface CollapsedReading {
  readonly workspacePath: string | null;
  readonly collapsed: ReadonlySet<string>;
}

/**
 * The groups collapsed in a view, remembered per workspace across restarts
 * (D53).
 *
 * Kept in desktop state rather than in settings: what a user collapsed is not a
 * preference they configured, and that document takes conflict-safe writes now,
 * so churning it on every toggle would collide with the writes that are. Nor in
 * the vault — it describes this machine, not the notes.
 *
 * Reads once per workspace and writes debounced. A vault with nothing stored
 * starts with everything open, which is also what a failed read falls back to:
 * the cost of not knowing is a group the user reopens, and the panel draws
 * either way.
 */
export function useCollapsedGroups(
  viewId: string
): readonly [ReadonlySet<string>, (next: ReadonlySet<string>) => void] {
  const workspaceRootPath = useSettingsStore((state) => state.workspaceRootPath);
  // Keyed by the workspace it belongs to, so leaving one does not need an
  // effect to write the reset back into state — another vault's collapsed set
  // simply is not this one's, and is not shown.
  const [reading, setReading] = useState<CollapsedReading>({
    workspacePath: null,
    collapsed: NO_GROUPS
  });

  useEffect(() => {
    // A workspace switch can land while the read is in flight; the answer for
    // the vault the user has left must not reopen groups in the one they opened.
    let cancelled = false;
    if (workspaceRootPath === null) return;
    void loadDesktopState()
      .then((state) => {
        if (cancelled) return;
        setReading({
          workspacePath: workspaceRootPath,
          collapsed: new Set(collapsedGroups(state, workspaceRootPath, viewId))
        });
      })
      .catch((error: unknown) => {
        // Everything open is the honest fallback for state we could not read.
        reportDesktopStateReadFailure(error);
        if (!cancelled) setReading({ workspacePath: workspaceRootPath, collapsed: NO_GROUPS });
      });
    return () => {
      cancelled = true;
    };
  }, [workspaceRootPath, viewId]);

  const [persist] = useState(() =>
    createDebounced<{ workspacePath: string; viewId: string; collapsed: readonly string[] }>(
      ({ workspacePath, viewId: view, collapsed: keys }) => {
        persistDesktopState({
          collapsedGroups: { workspacePath, viewId: view, collapsed: keys }
        });
      },
      PERSIST_DELAY_MS
    )
  );

  const update = useCallback(
    (next: ReadonlySet<string>) => {
      setReading({ workspacePath: workspaceRootPath, collapsed: next });
      if (workspaceRootPath === null) return;
      persist({ workspacePath: workspaceRootPath, viewId, collapsed: [...next] });
    },
    [persist, viewId, workspaceRootPath]
  );

  const collapsed = reading.workspacePath === workspaceRootPath ? reading.collapsed : NO_GROUPS;

  return [collapsed, update];
}
