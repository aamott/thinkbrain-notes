# Import dialog sign-in parity

Story 6f. Depends on 6d (labeled profiles) and 6e (Bring in from Git link).
Follow-up to onboarding: the import dialog must offer the same sign-in
choices Settings already has, without forcing a detour through Settings.

## Problem

Today the Bring-in dialog has a **Saved sign-in** select only. Settings also
has username/token fields, **New sign-in**, Update, and Forget. Import was
deliberately thin in 6e ("reuse profiles; do not redesign credentials").

What users hit:

1. **Saved sign-ins look missing.** The select is host-filtered: profiles
   appear only once the git link parses to a host, and only for that host.
   An empty/partial link, a host with no profiles, or a swallowed
   `readSignInStatus` failure all look like "no saved sign-ins." Treat
   honest empty/error copy as part of this story; fix any real catalog
   load bug found while doing so.
2. **No way to add a sign-in.** Private repos require a profile created
   earlier in Settings. Import should let someone create (or update) a
   profile for the pasted link's host in the same dialog.

## Decisions (settle while implementing if still open)

- **Reuse 6d model.** Opaque profile IDs, keychain `profile:{id}`, app-data
  catalog. No second credential store for import.
- **Host filter stays.** Offer profiles for the link's host only. Public
  HTTPS and local bare paths still allow "No sign-in".
- **Add / update in dialog.** Username + token fields when **New sign-in**
  (or an equivalent) is chosen, and when updating the selected profile.
  Persist via the existing save-credentials path **without** scheduling a
  round trip against the current open workspace (import's own trip runs
  after Bring in). Forget can stay Settings-only this story unless cheap.
- **Missing selection rule unchanged.** Never auto-pick a replacement
  profile when the chosen one is missing or wrong-host.
- **Plain language.** Same words as Settings ("Saved sign-in", access
  token). Do not invent a second jargon set.

## Acceptance

- [x] With a parseable HTTPS link whose host has saved profiles, the import
      select lists those profiles (same catalog Settings uses)
- [x] With no matching profiles, the UI says so clearly (not a blank-looking
      control with no explanation)
- [x] A `readSignInStatus` failure surfaces a recovery message instead of an
      empty list that looks like "none saved"
- [x] User can create a new labeled profile from the import dialog and then
      Bring in with it, without opening Settings
- [x] Creating/updating a profile from import does not kick off sync on the
      currently open workspace
- [x] Public / local bare import still works with no profile
- [x] Wrong-host / missing profile is refused; nothing silently substitutes
- [x] Focused tests cover list/filter, create-then-import, and no current-
      workspace trip on credential save from import

## Out of scope

- OAuth / "Sign in with GitHub" (story 9)
- Forget from the import dialog (optional stretch)
- Import into an existing/non-empty folder
- Branch picker

## Status

🟩 Implemented in app code. All acceptance criteria and focused tests passing.

