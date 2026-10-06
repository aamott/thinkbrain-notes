import {
  invokeNativeCommand,
  type NativeTextFileContents,
  type NativeTextFileEntry
} from "../native/commands";

export interface TextFileRef {
  readonly rootPath: string;
  readonly relativePath: string;
}

export interface TextFileWrite extends TextFileRef {
  readonly contents: string;
  /** Text on disk the save was computed from, or `undefined` for unchecked. */
  readonly expected: string | undefined;
}

export interface TextFileApi {
  readTextFile(request: TextFileRef): Promise<NativeTextFileContents>;
  writeTextFile(request: TextFileWrite): Promise<NativeTextFileEntry>;
}

/**
 * Native boundary for reading/writing non-Markdown text files (code, config,
 * etc.). Unlike `workspaceDocumentAdapter`, there is no Markdown extension
 * check — any UTF-8 text file in the workspace can be read or written.
 */
export function createTextFileApi(
  invoker: typeof invokeNativeCommand = invokeNativeCommand
): TextFileApi {
  return {
    readTextFile({ rootPath, relativePath }) {
      return invoker("read_text_file", { rootPath, relativePath });
    },
    writeTextFile({ rootPath, relativePath, contents, expected }) {
      return invoker("write_text_file", { rootPath, relativePath, contents, expected });
    }
  };
}

export const textFileApi = createTextFileApi();
