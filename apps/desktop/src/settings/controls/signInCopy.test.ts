import { describe, expect, it } from "vitest";

import type { SignInStatus } from "../../sync/historyTypes";
import { describeSignInStatus } from "./signInCopy";

const base: SignInStatus = {
  storage: "available",
  storageMessage: "This computer can keep a sign-in.",
  host: "github.com",
  selectedId: null,
  selected: null,
  profiles: [],
  legacy: null
};

describe("describeSignInStatus", () => {
  it("treats an unavailable backend as an error, not an empty list", () => {
    const copy = describeSignInStatus({
      ...base,
      storage: "unavailable",
      storageMessage: "Could not use this computer's keychain."
    });
    expect(copy.role).toBe("alert");
    expect(copy.text).toContain("keychain");
  });

  it("says when storage works and nothing is saved yet", () => {
    expect(describeSignInStatus(base).text).toMatch(/No sign-in is saved yet/);
  });

  it("names a selected saved profile", () => {
    const copy = describeSignInStatus({
      ...base,
      selectedId: "p1",
      selected: {
        id: "p1",
        label: "me@github.com",
        host: "github.com",
        username: "me",
        saved: true
      },
      profiles: [
        { id: "p1", label: "me@github.com", host: "github.com", username: "me" }
      ]
    });
    expect(copy.text).toBe("Sign-in saved as me@github.com.");
    expect(copy.role).toBe("status");
  });

  it("says when the selected profile's secret is gone", () => {
    const copy = describeSignInStatus({
      ...base,
      selectedId: "p-gone",
      selected: {
        id: "p-gone",
        label: "me@github.com",
        host: "github.com",
        username: "me",
        saved: false
      }
    });
    expect(copy.role).toBe("alert");
    expect(copy.text).toMatch(/no longer saved/);
  });

  it("does not offer a sign-in to a different host", () => {
    const copy = describeSignInStatus({
      ...base,
      host: "gitlab.com",
      selected: {
        id: "p-github",
        label: "me@github.com",
        host: "github.com",
        username: "me",
        saved: true
      }
    });
    expect(copy.role).toBe("alert");
    expect(copy.text).toContain("github.com");
    expect(copy.text).toContain("gitlab.com");
  });

  it("reports a leftover per-repository sign-in", () => {
    const copy = describeSignInStatus({
      ...base,
      legacy: { host: "github.com", username: "me" }
    });
    expect(copy.text).toMatch(/earlier version/);
  });
});
