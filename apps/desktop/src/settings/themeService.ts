import { invokeNativeCommand } from "../native/commands";
import { parseAppSettings, type AppThemeSetting } from "@thinkbrain/core";

export interface ThemeService {
  loadTheme(): Promise<AppThemeSetting>;
  saveTheme(theme: AppThemeSetting): Promise<void>;
}

/**
 * Reads and writes the app theme through the native settings commands.
 *
 * `saveTheme` delegates to `update_app_theme` so the host performs an atomic
 * read-modify-write of only the `theme` field; unrelated settings (editor
 * preferences, `desktopState`) are never rewritten by a theme change.
 */
const nativeThemeService: ThemeService = {
  /**
   * Returns the persisted theme, falling back to the core default when the
   * settings document is missing or malformed (`parseAppSettings` reports those
   * cases as diagnostics rather than throwing).
   */
  async loadTheme() {
    const raw = await invokeNativeCommand("read_app_settings");
    return parseAppSettings(raw).settings.theme;
  },
  /** Persists the theme, propagating `NativeCommandError` on host failures. */
  async saveTheme(theme) {
    await invokeNativeCommand("update_app_theme", { theme });
  }
};

export const themeService: ThemeService = nativeThemeService;
