export type AppPlatform = "desktop" | "mobile";

export interface AppIdentity {
  readonly displayName: string;
  readonly desktopAppId: string;
}

export interface DesignTokenNames {
  readonly colorBackground: string;
  readonly colorForeground: string;
  readonly colorAccent: string;
  readonly radiusMedium: string;
}

export interface WorkspaceDescriptor {
  readonly rootPath: string;
  readonly name: string;
}

export interface MarkdownFileEntry {
  readonly relativePath: string;
  readonly fileName: string;
  readonly parentPath: string;
  readonly byteSize: number;
  readonly updatedAt: string | null;
}

export interface MarkdownFileContents {
  readonly relativePath: string;
  readonly contents: string;
}

// A file-manager entry: a folder or any file type. Used by the explorer tree so
// folders (including empty ones) and non-Markdown files are visible, while
// Markdown-specific flows keep using MarkdownFileEntry.
export interface WorkspaceEntry {
  readonly relativePath: string;
  readonly name: string;
  readonly parentPath: string;
  readonly kind: "directory" | "file";
  readonly isMarkdown: boolean;
  readonly byteSize: number;
  readonly updatedAt: string | null;
}

export interface WorkspaceSnapshot {
  readonly workspace: WorkspaceDescriptor;
  readonly files: readonly MarkdownFileEntry[];
}

// Shared names stay platform-agnostic so future apps can map them to native tokens.
export const appIdentity: AppIdentity = {
  displayName: "Thinkbrain Notes",
  desktopAppId: "com.thinkbrain.notes"
};

export const designTokenNames: DesignTokenNames = {
  colorBackground: "--tn-color-background",
  colorForeground: "--tn-color-foreground",
  colorAccent: "--tn-color-accent",
  radiusMedium: "--tn-radius-medium"
};

export * from "./contributions";
export * from "./extensions";
export * from "./lifecycle";
export * from "./frontmatter";
// Journal data model: D42 filenames and the D48-D51 frontmatter contract.
export * from "./journal/index";
export * from "./layout";
export * from "./markdown";
export * from "./note-model";
export * from "./settings";
// New modular settings system (lives in ./settings/ directory alongside the
// legacy ./settings.ts persistence layer). Re-exported explicitly to avoid
// ambiguity between the file and directory sharing the basename "settings".
export * from "./settings/index";

// Theme file (.tbtheme.json) parser, validator, and serializer.
export * from "./theme";
