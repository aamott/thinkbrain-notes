# Model Configuration

## Goal

Let users select and configure AI providers and models: local vs cloud,
provider endpoint, model name, and API keys/credentials. Configuration extends
the existing JSON settings model and must never store credentials in the vault.

## Acceptance Criteria

- [ ] Settings UI exposes provider selection (local / cloud) and model fields.
- [ ] Credentials/API keys stored in OS app-data, never in the workspace.
- [ ] Configuration drives the core provider abstraction (no hardcoded
      provider in UI).
- [ ] Cloud providers are opt-in; local-only is a valid configuration.
- [ ] Missing/invalid configuration produces a clear, typed error.
- [ ] Settings persist at application and (where relevant) workspace level
      following the existing settings pattern.

## References

- `plans/technical-decisions.md` — Settings section (JSON, app-data, levels)
- `plans/ai.md` — architecture decisions (settings, privacy/consent)
- Depends on: provider abstraction story.
