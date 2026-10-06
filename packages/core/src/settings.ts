// Dynamic settings persistence lives in ./settings/dynamic.ts. It is
// re-exported here so the public API stays unchanged (consumers import from
// "@thinkbrain/core" which sources from here).
export {
  parseDynamicAppSettings,
  serializeDynamicSettings,
  serializeDynamicAppSettings,
  type ParseDynamicAppSettingsResult
} from "./settings/dynamic";

// `CURRENT_SETTINGS_VERSION` and the diagnostic types live in the
// `./settings/internal` leaf module so `./settings/dynamic.ts` can import them
// without creating a cycle back through this file. They are re-exported here
// for backward compatibility with consumers that import them from
// "@thinkbrain/core" via this module.
export {
  CURRENT_SETTINGS_VERSION,
  type SettingsDiagnostic,
  type SettingsDiagnosticSeverity
} from "./settings/internal";

// `AppThemeSetting` is declared beside the appearance module's theme options
// and re-exported here for backward compatibility.
export type { AppThemeSetting } from "./settings/modules/appearance";
