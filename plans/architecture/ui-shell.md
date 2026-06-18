# UI Shell

## Goal

Define the desktop layout so frontend agents do not invent incompatible navigation patterns.

## MVP Layout

The MVP desktop shell uses a VS Code/Obsidian-inspired layout:

```text
┌──────────────────────────────────────────────────────┐
│ Title/menu/command area                              │
├──────┬─────────────────────┬─────────────────────────┤
│ Act. │ Left sidebar        │ Editor area             │
│ bar  │                     │                         │
│      │ - Explorer          │ - Tabs                  │
│      │ - Search            │ - Active editor         │
│      │ - Git               │                         │
├──────┴─────────────────────┴─────────────────────────┤
│ Status bar                                           │
└──────────────────────────────────────────────────────┘
```

## Core Regions

## Activity Bar

Primary navigation between major panels:

- Explorer
- Search
- Source Control
- Settings entry point

## Left Sidebar

Displays the active activity panel.

MVP panels:

- file explorer
- search
- source control

## Editor Area

Contains tabs and the active document editor.

MVP document types:

- Markdown notes
- read-only unsupported-file placeholder, if needed

## Right Panel

Deferred for MVP unless needed for simple document metadata. Do not implement AI chat or advanced assistant UI.

## Command Palette

Command palette is desirable, but not required for the first MVP slice. If implemented early, it should expose only internal commands.

## State Model

Prefer abstract UI concepts that can later map to mobile without hardcoding every assumption:

- active workspace
- active document
- open documents
- active sidebar panel
- active command

Avoid spreading layout state through unrelated components.

## Non-Goals

Do not implement during MVP unless explicitly assigned:

- graph canvas
- AI panel
- marketplace UI
- collaboration presence
- publishing UI
