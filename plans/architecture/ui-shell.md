# UI Shell

## Goal

Define the desktop layout so frontend agents do not invent incompatible navigation patterns.

## MVP Layout

The MVP desktop shell uses a VS Code/Obsidian-inspired layout:

```text
┌──────────────────────────────────────────────────────────────┐
│ Title/menu/command area                                      │
├──────┬─────────────────────┬─────────────────────────┬───────┤
│ Act. │ Left sidebar        │ Editor area             │ Right │
│ bar  │                     │                         │ Panel │
│      │ - Explorer          │ - Tabs                  │ (ACP) │
│      │ - Search            │ - Active editor         │       │
│      │ - Git               │                         │       │
├──────┴─────────────────────┴─────────────────────────┴───────┤
│ Status bar                                                   │
└──────────────────────────────────────────────────────────────┘
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

The right panel is a popout intended to house the ACP (Agent Client Protocol) agent interface and AI chat. 
While deferred for MVP, the layout components should be structured to eventually accommodate this popout.

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
