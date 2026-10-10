# Story: Decide the remote-code trust boundary BEFORE registry work

`docs/reviews/2026-10-10/architecture-core-extensions-editor-med-hard.md` #1.

Extensions are deliberately trusted same-realm JS today — fine for local
development directories. A marketplace changes the threat model to remote
code delivery at scale: signing proves provenance, not safety; in the same
realm, fetched code reaches DOM, note contents, network, and every
renderer-exposed Tauri surface regardless of declared capabilities.

## Acceptance

- [ ] Prerequisite decision recorded: (a) worker/process RPC + sandboxed
      iframe/webview for UI, (b) separate extension-host process with a
      versioned message API, or (c) curated/trusted marketplace with no
      sandbox claim + strong publisher/review/revocation model.
- [ ] `extension_registry`/`extension_packaging` stories blocked until the
      choice is made; their designs updated to match.
- [ ] Local developer-directory loading stays same-realm and labelled
      trusted-local either way.
