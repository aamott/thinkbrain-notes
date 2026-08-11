import { invokeNativeCommand, NativeCommandError } from "../native/commands";

/**
 * The one door to the app-settings document's store-driven writes.
 *
 * The document has three writers. `update_desktop_state` and `update_app_theme`
 * each read and write inside a single locked Rust command, so they stay atomic
 * on their own. The settings store is different: it reads the document at load
 * (`read_app_settings`) and writes it later at save (`write_app_settings`), two
 * separate IPC round trips with the store's own async work in between. A
 * `desktopState` update landing in that window used to be silently reverted by
 * the save, because the save serialized whatever `desktopState` was on disk
 * when the store loaded rather than what was there when it wrote.
 *
 * Every store write therefore reads the document immediately before revising
 * it and carries what it read as a precondition the host checks under its own
 * lock, so a write that raced with another writer is refused rather than
 * silently accepted. This chain then only orders this window's store writers;
 * cross-writer conflicts (another window, or `update_desktop_state` landing
 * mid-save) are caught by the host and recomputed against, same as
 * `workspace/workspaceSettingsFile.ts`.
 */

/** The tail of the store's update chain, so the next update can queue behind it. */
let chain: Promise<unknown> = Promise.resolve();

export async function readAppSettingsDocument(): Promise<string | null> {
  return await invokeNativeCommand("read_app_settings");
}

/**
 * Revises the app-settings document and returns what was written.
 *
 * `revise` receives the document as it is on disk at the moment it runs — not
 * as it was when the caller decided to write — and returns the whole document
 * to store.
 */
export function updateAppSettingsDocument(
  revise: (current: string | null) => string
): Promise<string> {
  // A failed update must not strand the writers behind it, so the chain is
  // continued from a settled promise while the caller still sees the rejection.
  const previous = chain;
  const next = previous.then(
    () => runUpdate(revise),
    () => runUpdate(revise)
  );

  chain = next.catch(() => undefined);

  return next;
}

const CONFLICT = "settings.app_conflict";

/** Enough to outlast a burst from another writer, few enough to fail visibly. */
const MAX_ATTEMPTS = 4;

async function runUpdate(revise: (current: string | null) => string): Promise<string> {
  for (let attempt = 1; ; attempt += 1) {
    const current = await readAppSettingsDocument();
    const contents = revise(current);
    try {
      await invokeNativeCommand("write_app_settings", { contents, expected: current });
      return contents;
    } catch (error: unknown) {
      const conflicted = error instanceof NativeCommandError && error.code === CONFLICT;
      if (!conflicted || attempt >= MAX_ATTEMPTS) throw error;
    }
  }
}
