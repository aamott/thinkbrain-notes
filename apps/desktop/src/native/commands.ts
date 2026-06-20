import { invoke } from "@tauri-apps/api/core";

export interface NativeCommandErrorShape {
  readonly code: string;
  readonly message: string;
  readonly details?: string;
}

export class NativeCommandError extends Error {
  readonly code: string;
  readonly details?: string;

  constructor({ code, message, details }: NativeCommandErrorShape) {
    super(message);
    this.name = "NativeCommandError";
    this.code = code;
    this.details = details;
  }
}

export interface ShellStatus {
  readonly appName: string;
  readonly shellVersion: string;
  readonly ready: boolean;
}

interface NativeShellStatus {
  readonly app_name: string;
  readonly shell_version: string;
  readonly ready: boolean;
}

export interface NativeCommandMap {
  readonly desktop_shell_status: {
    readonly args: undefined;
    readonly result: NativeShellStatus;
  };
  readonly open_workspace: {
    readonly args: { readonly rootPath: string };
    readonly result: NativeWorkspaceSnapshot;
  };
  readonly list_markdown_files: {
    readonly args: { readonly rootPath: string };
    readonly result: readonly NativeMarkdownFileEntry[];
  };
  readonly read_markdown_file: {
    readonly args: {
      readonly rootPath: string;
      readonly relativePath: string;
    };
    readonly result: NativeMarkdownFileContents;
  };
  readonly write_markdown_file: {
    readonly args: {
      readonly rootPath: string;
      readonly relativePath: string;
      readonly contents: string;
    };
    readonly result: NativeMarkdownFileEntry;
  };
  readonly create_markdown_file: {
    readonly args: {
      readonly rootPath: string;
      readonly relativePath: string;
      readonly contents?: string;
    };
    readonly result: NativeMarkdownFileEntry;
  };
  readonly rename_markdown_file: {
    readonly args: {
      readonly rootPath: string;
      readonly relativePath: string;
      readonly newRelativePath: string;
    };
    readonly result: NativeMarkdownFileEntry;
  };
  readonly delete_markdown_file: {
    readonly args: {
      readonly rootPath: string;
      readonly relativePath: string;
    };
    readonly result: null;
  };
  readonly index_documents: {
    readonly args: {
      readonly rootPath: string;
      readonly documents: readonly NativeDocumentInput[];
    };
    readonly result: number;
  };
  readonly search_index: {
    readonly args: {
      readonly rootPath: string;
      readonly query: string;
      readonly limit?: number;
    };
    readonly result: readonly NativeSearchHit[];
  };
  readonly clear_index: {
    readonly args: { readonly rootPath: string };
    readonly result: null;
  };
  readonly remove_index_document: {
    readonly args: {
      readonly rootPath: string;
      readonly path: string;
    };
    readonly result: null;
  };
}

export type NativeCommandName = keyof NativeCommandMap;

type ShellStatusInvoker = () => Promise<NativeShellStatus>;

export interface NativeWorkspaceDescriptor {
  readonly root_path: string;
  readonly name: string;
}

export interface NativeMarkdownFileEntry {
  readonly relative_path: string;
  readonly file_name: string;
  readonly parent_path: string;
  readonly byte_size: number;
  readonly updated_at: string | null;
}

export interface NativeMarkdownFileContents {
  readonly relative_path: string;
  readonly contents: string;
}

export interface NativeWorkspaceSnapshot {
  readonly workspace: NativeWorkspaceDescriptor;
  readonly files: readonly NativeMarkdownFileEntry[];
}

// Sent to `index_documents`. Field names are camelCase here and mapped to the
// Rust struct's snake_case fields by serde's `rename_all = "camelCase"`.
export interface NativeDocumentInput {
  readonly path: string;
  readonly fileName: string;
  readonly title?: string;
  readonly tags: readonly string[];
  readonly aliases: readonly string[];
  readonly body: string;
}

export interface NativeSearchHit {
  readonly path: string;
  readonly file_name: string;
  readonly title?: string;
  readonly snippet: string;
  readonly score: number;
}

export async function invokeNativeCommand<TCommand extends NativeCommandName>(
  command: TCommand,
  args?: NativeCommandMap[TCommand]["args"]
): Promise<NativeCommandMap[TCommand]["result"]> {
  try {
    return await invoke<NativeCommandMap[TCommand]["result"]>(
      command,
      args as Record<string, unknown> | undefined
    );
  } catch (error) {
    throw normalizeNativeError(error);
  }
}

export async function getDesktopShellStatus(
  commandInvoker: ShellStatusInvoker = () =>
    invokeNativeCommand("desktop_shell_status")
): Promise<ShellStatus> {
  const status = await commandInvoker();

  return {
    appName: status.app_name,
    shellVersion: status.shell_version,
    ready: status.ready
  };
}

export function normalizeNativeError(error: unknown): NativeCommandError {
  if (error instanceof NativeCommandError) {
    return error;
  }

  if (isNativeErrorShape(error)) {
    return new NativeCommandError(error);
  }

  if (error instanceof Error) {
    return new NativeCommandError({
      code: "desktop.native_bridge_error",
      message: error.message
    });
  }

  return new NativeCommandError({
    code: "desktop.native_bridge_error",
    message:
      typeof error === "string"
        ? error
        : "The desktop native bridge returned an unknown error."
  });
}

function isNativeErrorShape(error: unknown): error is NativeCommandErrorShape {
  if (!error || typeof error !== "object") {
    return false;
  }

  const candidate = error as Record<string, unknown>;

  return (
    typeof candidate.code === "string" &&
    typeof candidate.message === "string" &&
    (candidate.details === undefined || typeof candidate.details === "string")
  );
}
