# Project Overview

## Vision

Build an open, privacy-first knowledge workspace inspired by Obsidian and VS Code.

The application should be:

- Fast
- Local-first
- Markdown-first
- Extensible
- AI-native
- Git-friendly
- Cross-platform: desktop (Tauri) and mobile (React Native/Expo), sharing core logic with platform-specific UIs

Users own their files.

No proprietary note format.

Everything is stored as normal Markdown files.

The project is designed to scale from a lightweight note editor into a complete knowledge platform.

---

## Core Technologies

Frontend
- React
- TypeScript
- Vite

Desktop
- Tauri

Mobile (Phase 2)
- React Native (Expo)

Editor
- CodeMirror 6

Backend
- Rust

Storage
- Markdown
- JSON configuration

Git
- System Git initially

AI
- Local and remote providers

Extensions
- Internal extension API