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

export * from "./frontmatter";
export * from "./markdown";
export * from "./note-model";
export * from "./settings";
