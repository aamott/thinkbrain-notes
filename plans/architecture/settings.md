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

Workspace settings location is a pending decision. Agents should not assume whether shareable workspace settings live inside the workspace until the policy is decided.

## Migration

Settings should include a version field so future migrations can be explicit.
