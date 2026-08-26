/** Re-exports the built-in settings modules for convenient registration. */

export { appearanceModule } from "./appearance";
export { editorModule } from "./editor";
export { settingsModule } from "./settings";
export {
  DEFAULT_CHECKPOINT_RETENTION_DAYS,
  DEFAULT_HISTORICAL_FILE_LIMIT_MB,
  DEFAULT_SETTLE_AUTOMATICALLY,
  syncModule,
  validateSyncDestination
} from "./sync";
export { MOBILE_HUB_CONTROL, uiModule } from "./ui";
