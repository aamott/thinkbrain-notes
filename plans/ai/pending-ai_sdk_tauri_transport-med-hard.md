# AI SDK Tauri Transport

## Goal

Prove and implement the custom Vercel AI SDK v7 `ChatTransport` required for
streaming desktop chat over Tauri IPC rather than an assumed `/api/chat` route.

## Acceptance Criteria

- [x] `ai@^7`, `@ai-sdk/react@^4`, `@assistant-ui/react`, and
      `@assistant-ui/react-ai-sdk` are installed in `@thinkbrain/desktop`.
- [ ] A typed renderer transport starts, receives, cancels, and reports one
      model-chat turn through Tauri commands/native events; event routing is
      filtered by chat session and turn IDs.
- [ ] Transport produces valid AI SDK UI-message stream data, propagates typed
      errors/cancellation, and never exposes provider credentials to React.
- [ ] `useChat` plus `useAISDKRuntime` integrates the transport; no local HTTP
      server, `/api/chat`, or fake fetch endpoint is added.
- [ ] Contract tests cover normal stream, cancellation, malformed event,
      crossed-session event, native error, and renderer cleanup.

## References

- `plans/ai.md` — Chat UI decision
- `apps/desktop/src/native/commands.ts`
- AI SDK transport docs: https://ai-sdk.dev/docs/ai-sdk-ui/transport
- assistant-ui runtime docs: https://www.assistant-ui.com/docs/runtimes/ai-sdk/overview
