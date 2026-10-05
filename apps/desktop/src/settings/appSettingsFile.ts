import { invokeNativeCommand } from "../native/commands";
import { createDocumentChain } from "../native/documentChain";

/**
 * The one door to the app-settings document's store-driven writes.
 *
 * The document has two kinds of writers. `update_desktop_state` reads and
 * writes inside a single locked Rust command, so it stays atomic on its own.
 * The settings store is different: it reads the document at load
 * and writes it back at save, two IPC round trips with the store's own work in
 * between. A `desktopState` update landing in that window used to be silently
 * reverted by the save, because the save serialized whatever `desktopState` was
 * on disk when the store loaded rather than what was there when it wrote.
 *
 * The ordering and conflict handling live in {@link createDocumentChain}; this
 * module is the app document's half of the configuration. There is only one app
 * document, so the key is a constant.
 */

const ONLY = "app";

const document = createDocumentChain({
  conflictCode: "settings.app_conflict",
  read: () => invokeNativeCommand("read_app_settings"),
  write: async (_key, contents, expected) => {
    await invokeNativeCommand("write_app_settings", { contents, expected });
  }
});

export async function readAppSettingsDocument(): Promise<string | null> {
  return await document.read(ONLY);
}

/** Revises the app-settings document and returns what was written. */
export function updateAppSettingsDocument(
  revise: (current: string | null) => string
): Promise<string> {
  return document.update(ONLY, revise);
}
