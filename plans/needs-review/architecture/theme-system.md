> [!WARNING]
> **AI Synthesized**: This file was synthesized by an AI agent based on conversational context. It was not explicitly written in the final chat summary and requires manual review.

# Theme System

## Philosophy
Themes are Extensions.

There is no separate "Theme API" or theme store. The application uses a single extension model.

## Implementation
- Themes use CSS variables to override the application's default tokens.
- They are packaged as standard extensions with a `manifest.json`.
- They are distributed the exact same way as functional extensions (Install from URL / File).
