- name: agentRegistry.ts and acpTypes.ts are unused-in-production scaffolding that has diverged from the agent_registry plan and exposes binary/args to the renderer
- file: /media/adam/extex/projects/thinkbrain-notes/apps/desktop/src/agent/acpTypes.ts
- lines: 25-38, 63-71, 89-118
- file: /media/adam/extex/projects/thinkbrain-notes/apps/desktop/src/agent/agentRegistry.ts
- lines: 1-166, 35-45
- description: |
    Context: `agentRegistry.ts` (~166 lines) and `acpTypes.ts` (~127 lines)
    are scaffolding only — no production code imports either module.
    `AssistantPanel.tsx` (the only production component in `agent/`) imports
    only `react`, `lucide-react`, and `@/lib/utils`. The full production call
    graph for these two modules is empty: `agentRegistry.ts` imports
    `acpTypes.ts` (for `AgentDescriptor`) and `@/native/commands` (for
    `invokeNativeCommand`); `acpTypes.ts` only re-exports types and augments
    `NativeCommandMap`. They are scaffolding for the pending ACP host work
    (`plans/ai/pending-agent_registry-low-med.md`,
    `plans/ai/pending-acp_host_runtime-med-hard.md`). Because the contract has
    also diverged from the plan (below), keeping ~290 lines of
    untested-by-production, plan-divergent code in the tree risks carrying the
    wrong contract forward.

    The pending plan (`plans/ai/pending-agent_registry-low-med.md`, line 17)
    specifies the contract:

    > `agent_list_available` returns `{agents: [{agentId, displayName,
    > available, acpMode, version?}], defaultAgentId?}`. It never returns an
    > arbitrary path or shell string to the renderer. Native spawn consumes only
    > a registered `agentId` … renderer never gets environment variables.

    The current scaffolding diverges in three ways:

    1. **Command name**: `agent_detect` (acpTypes.ts:91) vs `agent_list_available`
       (plan line 17).
    2. **Field names**: `id/label/binary/acpArgs/acpSupport/installed`
       (acpTypes.ts:25-38) vs `agentId/displayName/available/acpMode/version`
       (plan line 17).
    3. **Security boundary**: `AgentDescriptor` exposes `binary` (e.g.
       `"mistral"`) and `acpArgs` (e.g. `["vibe", "--acp"]`) to the renderer.
       The plan explicitly says the renderer must never receive arbitrary
       shell strings or args — only an opaque `agentId`. `agentRegistry.ts`
       line 35-40 hardcodes the full binary+args allowlist in the renderer,
       which is exactly the layer the plan wants to keep clean.

    None of this code is consumed by production yet (`AssistantPanel.tsx` does
    not import either module; only tests reference them — verified by grep),
    so the fix is to rewrite the contract to match the plan before wiring it
    in, rather than carrying the diverged types forward.

    Additionally, `AcpCommandMap` defines `agent_spawn`/`agent_prompt`/
    `agent_cancel`/`agent_close`, but the plan (and
    `pending-acp_host_runtime-med-hard.md` line 16) uses `agent_session_new`/
    `agent_session_close` as separate commands. The command surface should be
    reconciled with the host-runtime plan before implementation.

    Note (lower priority, fold into the rewrite): `AcpSessionUpdate`
    (acpTypes.ts:63-71) is a discriminated union with 8 variants where every
    variant repeats `readonly connectionId: string; readonly sessionId: string;`.
    Extracting a base type and intersecting it with the kind-specific payload
    removes the repetition and gives a single place to add future shared
    fields (e.g. `timestamp`). Apply this shape as part of the rewrite to
    match the plan rather than touching the divergent file twice.

    Options (pick one):
    1. Delete both files and re-introduce them as part of the
       `pending-agent_registry` story so the contract matches the plan from
       day one.
    2. Keep them but mark them clearly as `@internal` WIP and add a
       `// TODO(pending-agent_registry): rewrite to match plan contract` so
       the divergence is visible.
- verification: |
    `grep -rn "from.*agentRegistry\|from.*acpTypes" apps/desktop/src` shows
    only `agentRegistry.ts` imports `acpTypes.ts` and only tests import either;
    no production component (including `AssistantPanel.tsx`) uses them. The
    plan at `plans/ai/pending-agent_registry-low-med.md` line 17 and
    `plans/ai/pending-acp_host_runtime-med-hard.md` line 16 specify the
    intended contract.
