# Deferred: AI

AI is planned after the desktop MVP is stable.

## Future Direction

Potential capabilities:

- provider abstraction
- local providers such as Ollama and LM Studio
- cloud providers such as OpenAI, Anthropic, Google, and OpenRouter
- user-selectable local versus cloud models
- context-aware chat based on the active note/workspace
- Agent Client Protocol (ACP) integration for AI agents
- AI-assisted search and discovery

## UI Integration

- **Desktop (Right Panel Popout):** The AI chat and ACP agent interface will be housed in a right panel popout within the desktop UI shell.
- **Mobile (Bottom Sheet):** Since a mobile screen cannot fit a right panel alongside the editor, the ACP chat interface will translate to an interactive Bottom Sheet that slides up over the current active context, or a dedicated "Assistant" tab in the bottom navigation.

## Constraints

- AI must be optional.
- Cloud providers must be optional.
- Local models should be fully supported when AI work begins.
- No provider-specific logic should leak into UI components.
- Never send user notes to a remote provider without explicit user action/consent.

## Not MVP

Do not implement this during MVP work.
