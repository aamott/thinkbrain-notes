import { vi } from "vitest";

import type { SettingsStoreGateway } from "./settingsStoreTypes";

/**
 * Shared mock gateway for the settings store test suites
 * (`settingsStore.test.ts` and `settingsStore.extensions.test.ts`).
 */

/**
 * Creates a mock gateway with controllable app/workspace settings payloads.
 *
 * The `writeAppSettings` / `writeWorkspaceSettings` mocks capture the serialized
 * content so tests can assert what was persisted. Defaults to returning null
 * (no settings file) unless overridden.
 */
export function createMockGateway(
  appSettings: string | null = null,
  workspaceSettings: string | null = null
): SettingsStoreGateway & {
  writtenAppSettings: string[];
  writtenWorkspaceSettings: { rootPath: string; contents: string }[];
  /**
   * Simulates another writer — `update_desktop_state` or another window's
   * save — landing on the app-settings document outside this
   * store's knowledge, the way a tab open or panel resize does in production.
   */
  setAppDocument(contents: string | null): void;
} {
  const writtenAppSettings: string[] = [];
  const writtenWorkspaceSettings: { rootPath: string; contents: string }[] = [];
  // Stand-ins for the files, so `revise` sees what the last write left there.
  let appDocument = appSettings;
  let workspaceDocument = workspaceSettings;

  return {
    readAppSettings: vi.fn(async () => appDocument),
    writeAppSettings: vi.fn(async (revise: (current: string | null) => string) => {
      const contents = revise(appDocument);
      appDocument = contents;
      writtenAppSettings.push(contents);
      return contents;
    }),
    readWorkspaceSettings: vi.fn(async () => workspaceDocument),
    writeWorkspaceSettings: vi.fn(
      async (rootPath: string, revise: (current: string | null) => string) => {
        const contents = revise(workspaceDocument);
        workspaceDocument = contents;
        writtenWorkspaceSettings.push({ rootPath, contents });
        return contents;
      }
    ),
    setAppDocument: (contents: string | null) => {
      appDocument = contents;
    },
    writtenAppSettings,
    writtenWorkspaceSettings
  };
}

/** App settings JSON with a desktopState nested key (must be preserved). */
export const APP_JSON_WITH_DESKTOP_STATE = JSON.stringify({
  version: 1,
  "appearance.theme": "dark",
  "editor.fontSize": 20,
  "editor.lineWrapping": false,
  desktopState: {
    version: 3,
    lastWorkspacePath: "/notes/test",
    explorerOpen: true,
    leftPanelWidth: 288,
    rightPanelWidth: 320,
    bottomPanelOpen: false
  }
});
