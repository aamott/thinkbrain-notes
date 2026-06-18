> [!WARNING]
> **AI Synthesized**: This file was synthesized by an AI agent based on conversational context. It was not explicitly written in the final chat summary and requires manual review.

# Frontend Implementation

## Tech Stack
- React
- TypeScript
- Vite for fast build and HMR
- Zustand for state management
- CodeMirror 6 for the editor

## Architecture
- Strictly separating UI components from business logic (which lives in shared packages).
- Use React components primarily as thin wrappers around Zustand state and core logic hooks.

## State Management (Zustand)
Manages:
- Open tabs (`[{ id, type: 'markdown' | 'image', filePath }]`)
- Active tab
- Sidebar visibility and active panel
- Right panel state

## Editor
- Uses `uiwjs/react-md-editor` or a custom CodeMirror 6 setup.
- Implements live markdown preview (Obsidian-style).
- Drag-and-drop support for attachments (images/files). Automatically copies to the `attachments` folder and inserts a relative markdown link.
