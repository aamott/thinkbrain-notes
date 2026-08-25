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
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());

  useEffect(() => {
    // A workspace switch can land while the read is in flight; the answer for
    // the vault the user has left must not reopen groups in the one they opened.
    let cancelled = false;
    if (workspaceRootPath === null) {
      setCollapsed(new Set());
      return;
    }
    void loadDesktopState()
      .then((state) => {
        if (cancelled) return;
        setCollapsed(new Set(collapsedGroups(state, workspaceRootPath, viewId)));
      })
      .catch((error: unknown) => {
        // Everything open is the honest fallback for state we could not read.
        reportDesktopStateReadFailure(error);
        if (!cancelled) setCollapsed(new Set());
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
      setCollapsed(next);
      if (workspaceRootPath === null) return;
      persist({ workspacePath: workspaceRootPath, viewId, collapsed: [...next] });
    },
    [persist, viewId, workspaceRootPath]
  );

  return [collapsed, update];
}
