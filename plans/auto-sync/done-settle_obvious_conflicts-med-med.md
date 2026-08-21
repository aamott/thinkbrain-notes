# Settle the Obvious Conflicts

Story 5b. Not every conflict is a question. The ones that are not should not
be asked.

## Why this is not "merge like git does"

Git merges silently when a hunk changed on **one side only, relative to the
common ancestor**. That question takes three inputs and we have two: a cloud
daemon hands us two files and no base. Given `ours: ""` against
`theirs: "a new paragraph"`, "they added it" and "we deleted it" are opposite
decisions with the same two-way shape, and choosing between them by guessing a
base is how someone silently loses a paragraph they wrote. The parent plan's
"no base guessing, no quiescence heuristics" stands.

What *is* decidable without a base is narrower and provable, and story 5 made
the second half of it possible by making a note's recorded history readable.

## Scope

Two rules. Both are provable, neither needs a base, and both are checked
before a conflict is ever raised:

- **The copy is byte-identical to the note.** There is nothing to decide. Sync
  daemons produce these on metadata races and clock skew, and they are pure
  noise.
- **The copy's content matches a version already in the note's recorded
  history.** Then the other machine's file is a state ours has already passed
  through, so ours contains everything theirs had and keeping ours provably
  loses nothing. This is the "that device was behind" case.

Anything else is a real question and is asked, exactly as it is today.

- **Recorded, not silent.** An auto-settled copy is checkpointed before it is
  discarded, under its own reason, so the content is restorable and the
  conflict-rate counter can tell "you were asked" from "we handled it" — which
  is the number the three-way-for-cloud decision actually needs.
- **A setting, defaulting on.** Off means every conflict is asked about, which
  is today's behaviour.

## Acceptance

- [x] An identical copy never reaches the panel, and the note is untouched
- [x] A copy matching an earlier recorded version never reaches the panel —
      compared by blob id, so the question costs a tree lookup rather than
      reading every past version back
- [x] A copy that differs from the note *and* from every recorded version is
      raised exactly as before
- [x] A note with no recorded history at all falls back to the identical-only
      rule rather than failing or raising
- [x] Settled copies are restorable, and counted apart from the ones the user
      was asked about — the History panel says both numbers
- [x] With the setting off, nothing is settled automatically

## Not in scope

- **Three-way merge for cloud conflicts.** Still gated on the conflict rate,
  which this story finally makes meaningful by separating the two counts.
- **Auto-merging chunk by chunk.** That needs a base. It arrives with git sync
  (story 6), where the base is exact and gix does the merge — and there
  "silent when only one side touched it" is git's own behaviour and safe.

## What this story decided

**The setting defaults to on**, which is the unusual direction for something
that writes to someone's notes. The justification is that what it settles is
provably not a decision, and every one of them is checkpointed first — so the
worst case is a restore, not a loss.

**Settling happens before a conflict is raised, not after.** The alternative
was a panel that showed cards and then removed them, which is worse than never
showing them: a list that changes while you read it is a list you stop
trusting.

**Being unable to settle is a reason to ask.** Any failure — an unreadable
copy, a checkpoint that would not take — leaves the conflict exactly where it
was. Quietly dropping something we could not check is the one outcome worth
ruling out by construction.

## Known gaps

- **The default is written twice**, once in the settings module and once in
  the native side, which answers the question before any window is listening.
  A test pins each; nothing pins them to each other.
- **Settling is not announced.** A copy tidied away leaves a restore point and
  a number in the History panel's footer, but nothing says "3 were handled" at
  the time. The same missing notification surface as story 4's toast. Blocked
  on `notification_system` — a settle adapter pushes a silent/transient
  notification into the same store.

## Status

🟩 Done. Both rules, the setting, the separated counts.
