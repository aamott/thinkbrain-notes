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

Workspace settings may exist, but their location requires a product decision:

- inside the workspace for shareable project settings, or
- outside the workspace for private local preferences

Agents should not invent this policy without confirming it if the implementation depends on it.
