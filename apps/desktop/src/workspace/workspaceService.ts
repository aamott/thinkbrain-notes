import type {
  MarkdownFileContents,
  MarkdownFileEntry,
  WorkspaceDescriptor,
  WorkspaceSnapshot
} from "@thinkbrain/core";
import { open } from "@tauri-apps/plugin-dialog";

import {
  invokeNativeCommand,
  type NativeMarkdownFileContents,
  type NativeMarkdownFileEntry,
  type NativeWorkspaceDescriptor,
  type NativeWorkspaceSnapshot
} from "../native/commands";

export async function selectWorkspaceFolder(): Promise<string | null> {
  const selected = await open({
    directory: true,
    multiple: false,
    title: "Open Workspace"
  });

  return typeof selected === "string" ? selected : null;
}

export async function openWorkspace(
  rootPath: string
): Promise<WorkspaceSnapshot> {
  const snapshot = await invokeNativeCommand("open_workspace", { rootPath });

  return toWorkspaceSnapshot(snapshot);
}

export async function listMarkdownFiles(
  rootPath: string
): Promise<readonly MarkdownFileEntry[]> {
  const files = await invokeNativeCommand("list_markdown_files", { rootPath });

  return files.map(toMarkdownFileEntry);
}

export async function readMarkdownFile(
  rootPath: string,
  relativePath: string
): Promise<MarkdownFileContents> {
  const file = await invokeNativeCommand("read_markdown_file", {
    rootPath,
    relativePath
  });

  return toMarkdownFileContents(file);
}

export async function writeMarkdownFile(
  rootPath: string,
  relativePath: string,
  contents: string
): Promise<MarkdownFileEntry> {
  const file = await invokeNativeCommand("write_markdown_file", {
    rootPath,
    relativePath,
    contents
  });

  return toMarkdownFileEntry(file);
}

export async function createMarkdownFile(
  rootPath: string,
  relativePath: string,
  contents = ""
): Promise<MarkdownFileEntry> {
  const file = await invokeNativeCommand("create_markdown_file", {
    rootPath,
    relativePath,
    contents
  });

  return toMarkdownFileEntry(file);
}

export async function renameMarkdownFile(
  rootPath: string,
  relativePath: string,
  newRelativePath: string
): Promise<MarkdownFileEntry> {
  const file = await invokeNativeCommand("rename_markdown_file", {
    rootPath,
    relativePath,
    newRelativePath
  });

  return toMarkdownFileEntry(file);
}

export async function deleteMarkdownFile(
  rootPath: string,
  relativePath: string
): Promise<void> {
  await invokeNativeCommand("delete_markdown_file", {
    rootPath,
    relativePath
  });
}

export function normalizeMarkdownInputPath(input: string): string {
  const normalized = input.trim().replaceAll("\\", "/").replace(/^\/+/, "");

  if (!normalized) {
    return "";
  }

  return /\.(md|markdown)$/i.test(normalized) ? normalized : `${normalized}.md`;
}

export function toWorkspaceSnapshot(
  snapshot: NativeWorkspaceSnapshot
): WorkspaceSnapshot {
  return {
    workspace: toWorkspaceDescriptor(snapshot.workspace),
    files: snapshot.files.map(toMarkdownFileEntry)
  };
}

function toWorkspaceDescriptor(
  workspace: NativeWorkspaceDescriptor
): WorkspaceDescriptor {
  return {
    rootPath: workspace.root_path,
    name: workspace.name
  };
}

function toMarkdownFileEntry(file: NativeMarkdownFileEntry): MarkdownFileEntry {
  return {
    relativePath: file.relative_path,
    fileName: file.file_name,
    parentPath: file.parent_path,
    byteSize: file.byte_size,
    updatedAt: file.updated_at
  };
}

function toMarkdownFileContents(
  file: NativeMarkdownFileContents
): MarkdownFileContents {
  return {
    relativePath: file.relative_path,
    contents: file.contents
  };
}
