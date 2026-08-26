import { describe, expect, it } from "vitest";

import {
  IMPORT_DIALOG_TITLE,
  IMPORT_FROM_GIT_LABEL,
  importPhaseText,
  NO_PROFILE_LABEL,
  OPEN_FOLDER_LABEL,
  recoveryForImport,
  validateImportLink
} from "./gitLinkImportCopy";

describe("git-link import copy", () => {
  it("names the two selector actions without an ambiguous Add workspace", () => {
    expect(OPEN_FOLDER_LABEL).toBe("Open folder…");
    expect(IMPORT_FROM_GIT_LABEL).toBe("Bring in from Git link…");
    expect(IMPORT_DIALOG_TITLE.toLowerCase()).not.toContain("clone");
    expect(IMPORT_FROM_GIT_LABEL.toLowerCase()).not.toMatch(/\b(fetch|push|pull|commit)\b/);
  });

  it("rejects an empty link and a token in the URL", () => {
    expect(validateImportLink("")).toMatch(/git link/);
    expect(validateImportLink("https://you:token@github.com/you/notes.git")).toMatch(/token/);
    expect(validateImportLink("https://github.com/you/notes.git")).toBeNull();
    expect(validateImportLink("/tmp/notes.git")).toBeNull();
  });

  it("names checking, combining, and sending without git jargon", () => {
    expect(importPhaseText("checking")).toBe("Checking for updates…");
    expect(importPhaseText("combining")).toBe("Combining changes…");
    expect(importPhaseText("sending")).toBe("Sending changes…");
    for (const text of [
      importPhaseText("checking"),
      importPhaseText("combining"),
      importPhaseText("sending"),
      NO_PROFILE_LABEL
    ]) {
      expect(text.toLowerCase()).not.toMatch(/\b(fetch|clone|push|pull|commit)\b/);
    }
  });

  it("names a recovery action for import failures", () => {
    expect(recoveryForImport("sync.import_target_exists")).toMatch(/parent folder/);
    expect(recoveryForImport("sync.import_target_exists", true)).toMatch(/managed vault/);
    expect(recoveryForImport("sync.sign_in_missing")).toMatch(/saved sign-in/);
  });
});
