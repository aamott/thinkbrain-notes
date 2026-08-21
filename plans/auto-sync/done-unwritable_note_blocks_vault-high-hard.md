# One unwritable note blocks the vault forever

Carried from story 6b. A name that is legal here but not on Windows, or a file
where a folder now belongs, used to fail the write and abort before the merge
was recorded — so the next sync recomputed the same work and failed the same
way, with no way past it.

Same answer as a note that cannot be recorded (story 1): skip and report,
never abort the batch. Everything else lands; the bad note is needs-attention
with a recovery action; the next sync retries only that path.

## Acceptance

- [x] One note that cannot be written does not stop the rest of the vault
      syncing, and the next sync does not fail the same way with no way past it
- [x] The answer is shared with a note that cannot be recorded (story 1)

## Status

🟩 Done.
