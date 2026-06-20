import {
  parseAppSettings,
  serializeAppSettings,
  type AppSettings,
  type ParseSettingsResult
} from "@thinkbrain/core";

import { invokeNativeCommand } from "../native/commands";

export interface SettingsStorageAdapter {
  readonly readAppSettings: () => Promise<string | null>;
  readonly writeAppSettings: (contents: string) => Promise<void>;
  readonly readWorkspaceSettings: (rootPath: string) => Promise<string | null>;
  readonly writeWorkspaceSettings: (
    rootPath: string,
    contents: string
  ) => Promise<void>;
}

const nativeSettingsStorage: SettingsStorageAdapter = {
  readAppSettings: () => invokeNativeCommand("read_app_settings"),
  writeAppSettings: async (contents) => {
    await invokeNativeCommand("write_app_settings", { contents });
  },
  readWorkspaceSettings: (rootPath) =>
    invokeNativeCommand("read_workspace_settings", { rootPath }),
  writeWorkspaceSettings: async (rootPath, contents) => {
    await invokeNativeCommand("write_workspace_settings", { rootPath, contents });
  }
};

/**
 * Loads and validates app settings from the native raw JSON command.
 *
 * Args:
 *   storage: Settings storage adapter. Defaults to the Tauri native adapter.
 *
 * Returns:
 *   Parsed settings plus diagnostics from the shared core validator.
 */
export async function loadAppSettings(
  storage: SettingsStorageAdapter = nativeSettingsStorage
): Promise<ParseSettingsResult> {
  return parseAppSettings(await storage.readAppSettings());
}

/**
 * Serializes and persists app settings through the native raw JSON command.
 *
 * Args:
 *   settings: App settings to serialize.
 *   storage: Settings storage adapter. Defaults to the Tauri native adapter.
 *
 * Returns:
 *   The normalized settings that were serialized.
 */
export async function saveAppSettings(
  settings: AppSettings,
  storage: SettingsStorageAdapter = nativeSettingsStorage
): Promise<ParseSettingsResult> {
  const contents = serializeAppSettings(settings);

  await storage.writeAppSettings(contents);

  return parseAppSettings(contents);
}

export async function readRawWorkspaceSettings(
  rootPath: string,
  storage: SettingsStorageAdapter = nativeSettingsStorage
): Promise<string | null> {
  return storage.readWorkspaceSettings(rootPath);
}

export async function writeRawWorkspaceSettings(
  rootPath: string,
  contents: string,
  storage: SettingsStorageAdapter = nativeSettingsStorage
): Promise<void> {
  await storage.writeWorkspaceSettings(rootPath, contents);
}
