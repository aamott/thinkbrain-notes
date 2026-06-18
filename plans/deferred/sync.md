# Deferred: Sync

Built-in cloud sync is not part of MVP.

## Strategy

The future strategy is Bring Your Own Sync.

Users may place a workspace in a provider-managed folder such as:

- OneDrive
- Dropbox
- iCloud Drive
- Google Drive
- Syncthing

## Future Conflict Handling

Possible future features:

- detect provider-created conflict files
- show conflict notifications
- provide diff/merge UI
- maintain a conflict queue

## MVP Constraint

MVP must not store app caches or indexes inside the workspace. This keeps workspaces safer for external sync providers.

Do not implement conflict-resolution UI during MVP.
