# The Round Trip

Story 6b. One sync: bring down what changed, merge it, send ours back.

Depends on 6a for sending. Not blocked by 6c — a destination can be named
before there is a keychain to hold a password, and a repository that needs no
password (a folder, a LAN remote, a token already in the URL) works today.

## What is actually new here

Sending was written in 6a. Fetching, gitoxide already does. So the only genuinely
new decision is what to do when both sides moved — and that is the decision this
whole feature has been deferring since story 1, because until now there was no
common ancestor to decide it with.

There is one now. A git remote gives an **exact** base, so the argument that
banned three-way merging for cloud copies does not apply here: nothing is being
guessed.

## The merge: three ways, and why the middle one

**A. `repo.merge_commits(ours, theirs, …)` — let gitoxide do it.** It finds the
merge base, merges the trees, merges each blob line by line, and hands back a
tree plus a list of the paths it could not settle. Twenty lines. It is git's own
algorithm, including the cases a hand-rolled merge gets wrong for years: a file
added on both sides, a folder replaced by a file, mode changes, renames.

**B. Hand-rolled per-path three-way.** Diff base→ours and base→theirs; a path
only one side touched takes that side; a path both touched is a question. A
hundred and fifty lines to reimplement, badly, what A already does, and every
awkward case becomes a bug we find in someone's notes rather than in a test.

**C. Fast-forward only.** Refuse to pull when the two sides diverged. Thirty
lines, and useless for the case the feature exists for: two devices, both
written on.

**A**, with one deliberate limit: gitoxide can write conflict markers into a
merged file, and we do not want it to. `<<<<<<<` in the middle of someone's
notes is a format they never chose and their editor will not explain. Unresolved
paths stay unresolved and become a question instead.

## The question, in the shape that already exists

Story 3's own note says it: *"a two-way comparison of a daemon's copy and a
three-way merge against a real base produce the same shape, so the panel that
renders this does not learn which happened."* That was written before there was
anything to prove it, and it turns out to be the design.

So a path gitoxide could not settle is **written into the vault as a conflict
copy** — the same shape Syncthing and Dropbox leave behind, recognised by the
same table, listed by the same panel, resolved by the same merge view, settled
by the same rules, and checkpointed the same way. Story 6 adds no conflict UI at
all.

Three things fall out of that for free, which is the argument for it:

- **Conflicts survive quitting.** They are files. A pull interrupted halfway
  leaves a folder someone can still make sense of, and the next scan finds them.
- **They are never pushed.** Conflict copies are excluded from recording
  already, so a copy made here stays on the device that made it.
- **`settle` already applies.** A copy that turns out to hold nothing to decide
  is tidied away without asking, by rules that were written for a different
  cause and hold for this one.

## Scope

- **Where it syncs to.** One `sync.destination` string per workspace, in the
  workspace's own settings file. No remotes, no refspecs, no jargon.
- **Fetch** the destination's branch into a ref of ours. Never into
  `refs/heads/`, so nothing can mistake it for our own history.
- **Merge** with `merge_commits`, markers off. Resolved paths are written to the
  vault and committed as a merge with two parents. Unresolved ones become
  conflict copies and are left out of the commit.
- **Send** what results, with 6a. A refusal means the remote moved again while
  we worked; the answer is to go round once more, not to report a fault.
- **One at a time per vault.** A sync holds the workspace's lane, so two windows
  and a timer cannot interleave three of them.
- **"Sync now"**, and the status the pill shows while it runs.

## Acceptance

- [x] Two vaults on one destination converge: each sees the other's new notes
- [x] A note only one side changed merges silently — no question, no copy
- [x] A note both sides changed becomes a conflict copy, and the existing panel
      lists and resolves it with nothing added to it
- [x] No conflict marker is ever written into a note
- [x] A conflict copy made by a pull is never pushed
- [x] A first sync against an empty destination pushes, and against a non-empty
      one merges rather than refusing
- [x] A sync that cannot reach the destination leaves the vault untouched and
      says why
- [x] Two syncs at once on one vault do not interleave
- [x] Two devices that each already had notes can be joined at all

## Not in scope

- **Credentials** — story 6c, gated on the secret-storage plan.
- Other gaps tracked as their own stories (see Known gaps below).

## What this story decided

**An empty base rather than a refusal, when there is no shared history.** The
concurrency test found this, not a design review: two devices that each already
held notes have no common ancestor anywhere, and `merge_commits` says so. That
is not an edge case — it is what setting sync up on a second device looks like
every time. Refusing would leave someone with two folders that can never be
joined. An empty base keeps everything from both sides and turns only the
genuine name clashes into questions.

**A refusal is retried once, and only once.** It means the destination moved
while we were merging, and going round again merges what arrived. A third
attempt would be a loop shaped like a race someone else keeps winning, and the
answer to that is to say so.

**The button says "bring these notes in step", not "sync".** It appears only
once a destination has been named — a button that can only fail reads as
something the person already set up.

## What the review changed

**A destination could choose where this app wrote.** Nothing validated the
names arriving in a tree, and git's tree format allows an entry called `..`,
which `join` follows straight out of the folder. A test that crafted such a
tree and pushed it wrote a file into the vault's *parent* — proved by the
artifact it left behind. Names are now checked before anything is written, with
the same guard recording has always used, and a name that would leave the folder
stops the whole sync rather than being quietly skipped. The merge path happened
to be protected already by gitoxide's own validation; taking a first history
wholesale was not.

**A note being typed into was written over.** Applying a merge trusted the disk
to still hold what the last recorded state said. It does not, in two ordinary
cases: someone typing during a slow sync, and a sync interrupted after it wrote
but before it recorded. Every write now checks what is actually there, and
anything unexpected keeps what is on disk and puts the other side's version
beside it as a copy.

**A name in no encoding was silently mangled.** Rendering a path lossily gave a
different filename on each device, so neither could ever touch the other's. It
is refused by name instead.

**Gitlinks broke the push outright.** A folder with a repository of its own is
recorded as an entry whose id names a commit in *that* repository. Looking it up
here failed the whole push. Real git skips them; now so do we.

## Known gaps

Tracked as their own stories, not kept here:

- `pending-lane_test_strength-low-low.md`
- `pending-delete_vs_change_silent_resolution-med-med.md`
- `pending-unwritable_note_blocks_vault-high-hard.md`
- `pending-symlink_submodule_skipped-med-med.md`
- `pending-crash_conflict_copy_multiplication-high-hard.md`
- `pending-sync_trigger_debounce-low-med.md`
- `pending-large_sync_progress-low-low.md`

## Status

🟩 Done. Fetch, merge, copies, commit, send, the lane, the setting and the
button.
