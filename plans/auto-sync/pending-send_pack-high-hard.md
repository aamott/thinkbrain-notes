# Send Pack

Story 6a. The half of git sync that gitoxide does not have.

## Why this story exists

Story 6 says "push/pull via gix + rustls". Half of that is wrong, and it is the
half everything else waits on.

**gitoxide cannot push.** `gix-protocol` implements `ls-refs` and `fetch` and
nothing else; `gix::push` is a config enum for `push.default` and no code. There
is no `send_pack`, no `receive-pack` client, anywhere in the crate graph.

What *does* exist is the whole transport underneath it:

- `gix_transport::Service::ReceivePack` renders as `git-receive-pack`
- the blocking HTTP transport is generic over the service — `handshake` fetches
  `info/refs?service=git-receive-pack` and `request` POSTs to
  `git-receive-pack` with the matching content types
- basic auth, redirects, rustls and the file/ssh transports all come free,
  because none of them know which service they are carrying

So the missing piece is not the network. It is the protocol on top: which refs
to move, which objects to send, and how to read what the server says back. That
is this story, and it is worth doing alone because it is the part most likely to
be wrong, and it can be proved without a network, a server, or a password.

## Why not the alternatives

- **Shell out to `git`.** Ruled out by the parent plan: no git CLI, and it would
  need a git on the user's machine to make their notes sync.
- **`git2` (libgit2) for push only.** Two object stores in one app, disagreeing
  at the margins; a C toolchain in the Android cross-compile that story exists
  to keep simple; and a second answer to "what is in this repository". The
  reason this app is on gix is the reason not to.
- **A provider's HTTP API.** Locks sync to whoever we wrote it against.

## Scope

One module: build a pack, speak `git-receive-pack`, report what landed.

- **Which objects.** Walk commits from the local tip with the remote's tip
  hidden, so everything the remote already has is excluded by construction. Per
  commit take its tree plus what a tree diff against its first parent calls
  added or modified — the same `gix::diff::tree` reader history already uses.
  A first push has no remote tip and no special case: the root commit diffs
  against the empty tree, so every object is named exactly once.
- **The pack, written directly.** Header, one deflated entry per object, hash
  trailer. `gix-pack` can generate packs, but only behind a feature `gix` does
  not enable, so using it means a second direct dependency pinned to whatever
  version `gix` resolved — a coupling that breaks on a patch release. The
  format is small enough to write, and writing it keeps the version surface at
  one crate.
- **No deltas.** Every object goes out whole. It costs upload size on a first
  push and almost nothing after, because after the first push we only ever send
  what changed since the last one — and that is a handful of small notes.
- **The exchange.** Handshake as `ReceivePack` over protocol v1 (receive-pack
  has no v2), read the ref advertisement, send one update command with the old
  and new ids, stream the pack, read `report-status`.
- **Refusal is an answer, not an error.** A non-fast-forward push is the server
  telling us the remote moved. It has to arrive as data the caller can act on —
  fetch, merge, try again — not as a failure string.

## Acceptance

- [x] A push into an empty remote lands every object, and the remote's ref
      points at our tip
- [x] A second push sends only what changed — proved by object count, not by
      the ref moving
- [x] A push whose remote moved underneath it is refused, and says so as a
      distinguishable outcome rather than an opaque error
- [x] A history containing a merge commit pushes completely — every object the
      remote needs arrives, with only first-parent diffs computed
- [x] The checkpoint ref is never sent
- [x] Everything above is proved against a real repository over the file
      transport, with no network and no credentials

## Not in scope

- **Fetch, merge, "Sync now", triggers, status.** Story 6b.
- **Credentials.** Story 6c, and gated: the extension secret storage plan
  forbids choosing a keychain crate until its open questions are answered.
  Nothing here needs one — the transport takes an optional account and the file
  transport takes none.
- **Delta compression, thin packs, push options, force push, deleting refs.**

## What this story decided

**Refusing a stale push is ours to do, not the server's.** The first version of
the refusal test failed because the push *succeeded*: `receive.denyNonFastForwards`
is off by default, so a plain git server asked to throw away someone else's
writing will do exactly that. git's own client is what refuses, by checking that
the advertised tip is an ancestor of what it is about to send, and so do we — a
remote tip we cannot even find has no merge base with ours and is refused by the
same rule.

**A server's refusal still has to be read.** No local check predicts a protected
branch or a pre-receive hook, and calling one of those a success would tell
someone their notes are safe somewhere they never arrived. That path stayed
unproved until a test made a server say no for a reason we could not have
guessed — the whole report-reading path had no coverage at all until then.

**Tests speak to real `git receive-pack`.** The file transport spawns it, so a
pack we wrote by hand is validated by the same `index-pack` a real server runs.
That is far better evidence than a mock, and it costs only a `git` on the
machine running the tests — never on a user's.

## Known gaps

- **Nothing calls this yet**, so the module carries an `allow(dead_code)`. Story
  6b is the caller.
- **No progress reporting.** A first push of a large vault is one silent
  operation. It needs a story once there is a UI to report into.
- **Tests need `git` on PATH** — for the file transport only. The shipped app
  never uses it.

## Status

🟩 Done. Object selection, the packfile, the exchange, and the two refusals.
