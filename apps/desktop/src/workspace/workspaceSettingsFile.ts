import { invokeNativeCommand } from "../native/commands";
import { createDocumentChain } from "../native/documentChain";

/**
 * The one door to a workspace's settings document.
 *
 * Two writers share the file: the explorer's show-hidden toggle and the
 * settings store's dynamic values. Neither owns the whole document, so both
 * read, merge and write it back — and interleaved, the second revises a copy
 * the first has already replaced. That is how the journal's field definitions
 * disappeared on restart.
 *
 * The ordering and conflict handling live in {@link createDocumentChain}; this
 * module is the workspace's half of the configuration. Chains are keyed by root
 * because two open workspaces are two files with nothing to say to each other.
 */

const document = createDocumentChain({
  conflictCode: "settings.workspace_conflict",
  read: (rootPath) => invokeNativeCommand("read_workspace_settings", { rootPath }),
  write: async (rootPath, contents, expected) => {
    await invokeNativeCommand("write_workspace_settings", { rootPath, contents, expected });
  }
});

export async function readWorkspaceSettingsDocument(rootPath: string): Promise<string | null> {
  return await document.read(rootPath);
}

/** Revises the document for `rootPath` and returns what was written. */
export function updateWorkspaceSettingsDocument(
  rootPath: string,
  revise: (current: string | null) => string
): Promise<string> {
  return document.update(rootPath, revise);
}
