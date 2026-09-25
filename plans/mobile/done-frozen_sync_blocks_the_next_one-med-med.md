# A Frozen Sync Must Not Block Its Retry

**Status:** ✅ implemented · **Urgency:** med · **Difficulty:** med

An Android process can freeze while a sync holds its in-flight claim. The
shared schedule records the claim's wall-clock start and generation; after ten
minutes, a later trip may take it over. The per-workspace lane serializes the
replacement, and the generation prevents an older worker from clearing the new
worker's claim.

The takeover path is covered at the engine and sweeper levels. The slow-remote
device freeze scenario was not re-run. Background leave handling still starts
the shared round-trip path, rather than a push-only operation; Android may
freeze it before completion, so it remains best effort.

See `engine.rs`, `round.rs`, and
`docs/superpowers/specs/2026-08-28-sync-schedule-design.md`.
