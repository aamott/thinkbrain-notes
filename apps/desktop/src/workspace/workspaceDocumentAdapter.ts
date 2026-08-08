import {
  invokeNativeCommand,
  type NativeCommandMap,
  type NativeMarkdownFileContents,
  type NativeMarkdownFileEntry
} from "../native/commands";
import { appEvents } from "../events/appEvents";

export interface WorkspaceMarkdownDocumentRef {
  readonly rootPath: string;
  readonly relativePath: string;
}

export interface WorkspaceMarkdownDocumentWrite extends WorkspaceMarkdownDocumentRef {
  readonly contents: string;
}

export interface WorkspaceMarkdownDocumentCreate extends WorkspaceMarkdownDocumentRef {
  readonly contents?: string;
}

export interface WorkspaceDocumentApi {
  readMarkdownDocument(request: WorkspaceMarkdownDocumentRef): Promise<NativeMarkdownFileContents>;
  writeMarkdownDocument(request: WorkspaceMarkdownDocumentWrite): Promise<NativeMarkdownFileEntry>;
  createMarkdownDocument(request: WorkspaceMarkdownDocumentCreate): Promise<NativeMarkdownFileEntry>;
}

type WorkspaceDocumentCommand =
  | "read_markdown_file"
  | "write_markdown_file"
  | "create_markdown_file";

type WorkspaceDocumentCommandInvoker = <TCommand extends WorkspaceDocumentCommand>(
  ...[command, args]: NativeCommandMap[TCommand]["args"] extends undefined
    ? [command: TCommand]
    : [command: TCommand, args: NativeCommandMap[TCommand]["args"]]
) => Promise<NativeCommandMap[TCommand]["result"]>;

/**
 * Creates the workspace document boundary used by UI consumers. It deliberately
 * owns the native command names and their camelCase Tauri argument shapes.
 *
 * Every save and create in the app funnels through here — shell saves,
 * extension workspace writes, explorer flows — so this is the one place that
 * can emit `note.saved` and `note.created` without any path being missed.
 */
export function createWorkspaceDocumentApi(
  commandInvoker: WorkspaceDocumentCommandInvoker = invokeNativeCommand
): WorkspaceDocumentApi {
  return {
    readMarkdownDocument({ rootPath, relativePath }) {
      return commandInvoker("read_markdown_file", { rootPath, relativePath });
    },
    async writeMarkdownDocument({ rootPath, relativePath, contents }) {
      const written = await commandInvoker("write_markdown_file", {
        rootPath,
        relativePath,
        contents
      });
      appEvents.emit("note.saved", { rootPath, relativePath });
      return written;
    },
    async createMarkdownDocument({ rootPath, relativePath, contents }) {
      const created = await commandInvoker("create_markdown_file", {
        rootPath,
        relativePath,
        contents
      });
      appEvents.emit("note.created", { rootPath, relativePath });
      return created;
    }
  };
}

export const workspaceDocumentApi = createWorkspaceDocumentApi();
