/**
 * Built-in Auto Sync module.
 *
 * Scope is `"app"` rather than per-workspace: this is a preference about how
 * much the app is trusted to decide on someone's behalf, and someone who wants
 * to be asked about everything wants that in every folder, not one at a time.
 */

import type { SettingsModule } from "../types";

/**
 * Auto Sync preferences.
 *
 * `settleAutomatically` defaults to `true`, which is the unusual direction for
 * a default that writes to someone's notes — the justification is that what it
 * settles is provably not a decision. A copy identical to the note, or one
 * holding a version the note has already been through, contains nothing that
 * could be lost by discarding it, and every one of them is checkpointed first.
 * Anything a base would be needed to judge is still asked about.
 *
 * The native side reads this key directly and repeats the default, because it
 * has to answer the same question before any window is listening. Both are
 * `true`; changing one means changing the other.
 */
export const syncModule: SettingsModule = {
  id: "sync",
  label: "Sync",
  scope: "app",
  sections: [
    {
      id: "sync.conflicts",
      label: "Conflicts",
      settings: [
        {
          key: "settleAutomatically",
          type: "boolean",
          default: true,
          scope: "app",
          section: "sync.conflicts",
          label: "Settle obvious conflicts without asking",
          description:
            "When another device's copy of a note is identical to yours, or holds a version yours has already been through, keep yours and tidy the copy away. Earlier versions stay in History either way. Turn this off to be asked about every copy."
        }
      ]
    }
  ]
};
