# Workspace

## Definition

A workspace is a folder selected by the user.

The workspace contains normal user files, especially Markdown notes and attachments.

## MVP Behavior

The app should support:

- opening a workspace folder
- remembering recent workspaces
- listing Markdown files
- reading note contents
- writing note contents
- creating notes
- renaming notes
- deleting notes with confirmation

## Portability Rule

Projects remain portable folders.

Opening a workspace must not modify user files unnecessarily.

## App Data Rule

Application data, caches, settings not intended for the workspace, and indexes must not be stored in the workspace.

Store app data in the OS application-data/config directory.

## Workspace Settings

Workspace settings live outside the workspace in the OS application-data/config directory, keyed by workspace identity/path.

Do not create app-specific settings files inside the user's workspace during MVP.
