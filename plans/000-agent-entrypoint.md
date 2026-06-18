# Agent Entrypoint

This is the first document a parent agent should read before planning or delegating work.

## Required Reading Order

1. `plans/001-project-overview.md`
2. `plans/002-core-principles.md`
3. `plans/003-roadmap.md`
4. `plans/004-technical-decisions.md`
5. `plans/005-mvp-scope.md`
6. `plans/006-testing-strategy.md`
7. `plans/work-items/README.md`

## Parent Agent Workflow

The parent agent must:

1. Read the core documents listed above.
2. Select work items from `plans/work-items/`.
3. Assign each sub-agent exactly one work item unless a task explicitly says otherwise.
4. Give each sub-agent:
   - the assigned work-item file
   - required reading files
   - allowed edit scope
   - explicit non-goals
   - validation expectations
5. Review sub-agent output for:
   - scope creep
   - conflicts with `plans/004-technical-decisions.md`
   - inconsistent interfaces
   - missing tests
   - lint/typecheck/build failures

## Rules for All Agents

- Markdown files are the source of truth for user data.
- SQLite may be used only as a disposable cache/index.
- Desktop MVP comes before mobile.
- Do not implement Phase 2 or Phase 3 features unless a work item explicitly assigns them.
- Do not add cloud sync, AI, marketplace, collaboration, graph, canvas, or publishing features during MVP work.
- Sub-agents should not edit files outside their assigned scope.
- Prefer simple, understandable code over broad abstractions.
- If a technical decision is missing, stop and report the decision needed instead of inventing a long-term architecture.

## Current Status

Planning is organized into:

- `plans/architecture/`: authoritative system design documents.
- `plans/work-items/`: delegatable implementation tasks.
- `plans/deferred/`: important future scope that must not leak into MVP.
- `plans/archive/`: non-authoritative historical notes.
