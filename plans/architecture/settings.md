# Settings

## Goal

Provide simple, human-readable settings without locking users into a proprietary data format.

## Settings Levels

MVP settings levels:

1. Application settings
2. Workspace settings

Future settings level:

3. Extension settings

## Format

Settings use JSON.

Requirements:

- human-readable
- versioned
- migratable
- validated at load time
- clear error messages for invalid settings

## Storage Locations

Application settings should live in the OS application-data/config directory.

Workspace settings should also live outside the workspace in the OS application-data/config directory, keyed by workspace identity/path.

Do not create app-specific settings files inside the user's workspace during MVP. This keeps shared Markdown folders clean and avoids surprising collaborators or Git users.

## Migration

Settings should include a version field so future migrations can be explicit.
