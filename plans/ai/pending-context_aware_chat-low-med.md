# Context-Aware Chat

## Goal

Let a user opt into sending the active note or a bounded workspace selection to
model chat, while ACP agents obtain context only through the capabilities they
request.

## Acceptance Criteria

- [ ] The composer shows exactly which note/selection/workspace summary will be
      included and lets the user remove it before sending.
- [ ] Local provider context works offline. Remote context requires a separate,
      explicit consent decision from ACP filesystem/terminal permission.
- [ ] Context creation is bounded, cancelable, redacts credentials/app data,
      and produces typed failures for unavailable files/index data.
- [ ] ACP agents receive no hidden prompt-injected workspace data; they request
      scoped capabilities and use the ACP permission flow instead.
- [ ] Tests prove no context is sent when toggled off or consent is denied.

## References

- `plans/ai.md`
- `plans/ai/pending-provider_configuration_and_gateway-med-hard.md`
- `plans/ai/pending-acp_capabilities_and_permissions-med-hard.md`
