import { useEffect, useState } from "react";

import { listConflicts, subscribeToConflictChanges } from "./conflictService";

/**
 * How many things are waiting on a decision in this workspace.
 *
 * For the badge over the panel's icon. Someone who has never opened the panel
 * has no reason to look at it, so the count is the only thing that tells them
 * a note changed in two places — and it stays live, because the copy that
 * caused it can arrive while they are working in another one.
 *
 * A failure counts as nothing rather than throwing: a badge is an invitation,
 * and the panel itself is where a problem reading the list is explained.
 */
export function useConflictCount(rootPath: string | null): number {
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!rootPath) {
      setCount(0);
      return;
    }
    let cancelled = false;
    let stop: (() => void) | null = null;

    const refresh = () => {
      void listConflicts(rootPath)
        .then((conflicts) => {
          if (!cancelled) setCount(conflicts.length);
        })
        .catch(() => {
          if (!cancelled) setCount(0);
        });
    };

    refresh();
    void subscribeToConflictChanges(refresh).then((unlisten) => {
      if (cancelled) unlisten();
      else stop = unlisten;
    });

    return () => {
      cancelled = true;
      stop?.();
    };
  }, [rootPath]);

  return count;
}
