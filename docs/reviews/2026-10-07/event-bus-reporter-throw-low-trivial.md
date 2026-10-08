# A throwing `onListenerError` reporter reintroduces the propagation the bus exists to prevent

- **Urgency:** low
- **Difficulty:** trivial
- **File:** `/media/adam/extex/projects/thinkbrain-notes/packages/core/src/extensions/events.ts`
- **Lines:** 59-65

## Description

The module docstring states the point of routing events through the bus: "one subscriber
throwing must not swallow the event for the rest". `emit` wraps listener invocation in
try/catch — but then calls `onListenerError(event, error)` *outside* the try. If the
reporter itself throws (host-supplied callback, e.g. a telemetry sink hitting a quota),
the exception propagates out of `emit`, remaining listeners never see the event, and the
emitter sees an exception — the exact failure-isolation guarantee the bus promises is
broken by its own error path.

## Recommendation

Wrap the reporter call in its own try/catch (swallow, or fall back to `reportToConsole`
when a custom reporter throws — though swallowing is simpler and still correct since
`emit`'s contract is best-effort delivery).

## Verification

Read events.ts:53-66. `onListenerError` is invoked inside the `catch` block but with no
guard; a throw there exits `emit`'s loop early. `createEventBus` accepts any
`ListenerErrorReporter` (events.ts:35-37) with no non-throwing contract.
