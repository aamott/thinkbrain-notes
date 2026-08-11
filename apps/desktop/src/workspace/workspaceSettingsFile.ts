import { invokeNativeCommand, NativeCommandError } from "../native/commands";

/**
 * The one door to a workspace's settings document.
 *
 * Two writers share the file: the explorer's show-hidden toggle and the
 * settings store's dynamic values. Neither owns the whole document, so each
 * reads it, merges its own keys and writes the result back — and two of those
 * sequences interleaved lose whichever landed first, because the second one
 * revised a copy the first had already replaced. That is how the journal's
 * field definitions disappeared on restart.
 *
 * Every update therefore runs through one chain per workspace and reads the
 * document immediately before revising it, so no writer in this window can
 * revise a copy a completed write has already superseded. Chains are per root
 * because two open workspaces are two files with nothing to say to each other.
 */

/** The tail of each workspace's update chain, so the next update can queue behind it. */
const chains = new Map<string, Promise<unknown>>();

export async function readWorkspaceSettingsDocument(rootPath: string): Promise<string | null> {
  return await invokeNativeCommand("read_workspace_settings", { rootPath });
}

/**
 * Revises the document for `rootPath` and returns what was written.
 *
 * `revise` receives the document as it is on disk at the moment it runs — not
 * as it was when the caller decided to write — and returns the whole document
 * to store.
 */
export function updateWorkspaceSettingsDocument(
  rootPath: string,
  revise: (current: string | null) => string
): Promise<string> {
  // A failed update must not strand the writers behind it, so the chain is
  // continued from a settled promise while the caller still sees the rejection.
  const previous = chains.get(rootPath) ?? Promise.resolve();
  const next = previous.then(
    () => runUpdate(rootPath, revise),
    () => runUpdate(rootPath, revise)
  );

  chains.set(rootPath, next);
  void next.catch(() => undefined).finally(() => {
    // Only the tail is worth remembering; anything else is a chain nobody can
    // still be waiting on.
    if (chains.get(rootPath) === next) chains.delete(rootPath);
  });

  return next;
}

/**
 * The chain only orders this window's writers. Another window sharing the
 * workspace is ordered by the host instead: the write carries the document the
 * revision was computed from, and the host refuses it if that is no longer what
 * is on disk. A refusal means someone else's keys are in the file now, so the
 * revision is recomputed against them rather than written over them.
 */
const CONFLICT = "settings.workspace_conflict";

/** Enough to outlast a burst from another window, few enough to fail visibly. */
const MAX_ATTEMPTS = 4;

async function runUpdate(
  rootPath: string,
  revise: (current: string | null) => string
): Promise<string> {
  for (let attempt = 1; ; attempt += 1) {
    const current = await readWorkspaceSettingsDocument(rootPath);
    const contents = revise(current);
    try {
      await invokeNativeCommand("write_workspace_settings", {
        rootPath,
        contents,
        expected: current
      });
      return contents;
    } catch (error: unknown) {
      const conflicted = error instanceof NativeCommandError && error.code === CONFLICT;
      if (!conflicted || attempt >= MAX_ATTEMPTS) throw error;
    }
  }
}
