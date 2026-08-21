// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SettingDefinition } from "@thinkbrain/core";
import { useSettingsStore } from "../settingsStore";
import type { SavedSignIn, SignInStatus } from "../../sync/historyTypes";

const saveSyncCredentials = vi.fn<
  (
    rootPath: string,
    destination: string,
    username: string,
    token: string,
    profileId?: string | null,
    label?: string | null
  ) => Promise<SavedSignIn>
>();
const saveSyncLink = vi.fn<
  (rootPath: string, destination: string, profileId?: string | null) => Promise<SavedSignIn>
>();
const readSignInStatus = vi.fn<
  (rootPath: string, destination: string, profileId?: string | null) => Promise<SignInStatus>
>();
const forgetSignIn = vi.fn<(profileId: string) => Promise<void>>();
const saveSettings = vi.fn<() => Promise<{ success: boolean; diagnostics: [] }>>();

vi.mock("../../sync/syncService", () => ({
  saveSyncCredentials: (
    rootPath: string,
    destination: string,
    username: string,
    token: string,
    profileId?: string | null,
    label?: string | null
  ) => saveSyncCredentials(rootPath, destination, username, token, profileId, label),
  saveSyncLink: (rootPath: string, destination: string, profileId?: string | null) =>
    saveSyncLink(rootPath, destination, profileId),
  readSignInStatus: (rootPath: string, destination: string, profileId?: string | null) =>
    readSignInStatus(rootPath, destination, profileId),
  forgetSignIn: (profileId: string) => forgetSignIn(profileId)
}));

const { GitLinkControl } = await import("./GitLinkControl");

let root: Root | null = null;
let host: HTMLDivElement | null = null;

const emptyStatus: SignInStatus = {
  storage: "available",
  storageMessage: "This computer can keep a sign-in.",
  host: "github.com",
  selectedId: null,
  selected: null,
  profiles: [],
  legacy: null
};

const savedProfile = {
  id: "p-saved",
  label: "you@github.com",
  host: "github.com",
  username: "you"
};

beforeEach(() => {
  saveSyncCredentials.mockReset().mockResolvedValue({
    profile: savedProfile,
    migrated: false
  });
  saveSyncLink.mockReset().mockResolvedValue({ profile: savedProfile, migrated: false });
  readSignInStatus.mockReset().mockResolvedValue(emptyStatus);
  forgetSignIn.mockReset().mockResolvedValue(undefined);
  saveSettings.mockReset().mockResolvedValue({ success: true, diagnostics: [] });
});

afterEach(async () => {
  await act(async () => root?.unmount());
  host?.remove();
  root = null;
  host = null;
  useSettingsStore.setState({
    workspaceRootPath: null,
    stagedChanges: {},
    workspaceValues: null
  });
});

const definition: SettingDefinition = {
  key: "sync.destination",
  label: "Git link",
  description: "",
  type: "string",
  default: "",
  scope: "workspace",
  section: "sync.destination",
  validation: (value) =>
    typeof value === "string" && value.startsWith("https://") ? null : "Paste an HTTPS git link."
};

async function render(value: string, profileId: string = "") {
  useSettingsStore.setState({
    workspaceRootPath: "/notes",
    saveSettings,
    workspaceValues: { "sync.destination": value, "sync.signInProfile": profileId },
    stagedChanges: {}
  });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root?.render(<GitLinkControl definition={definition} value={value} onChange={() => undefined} />));
  await act(async () => undefined);
  return host;
}

function input(id: string): HTMLInputElement {
  const found = host?.querySelector<HTMLInputElement>(`#${CSS.escape(id)}`);
  if (!found) throw new Error(`Missing input ${id}`);
  return found;
}

function button(label: string): HTMLButtonElement {
  const found = [...(host?.querySelectorAll("button") ?? [])].find((node) =>
    (node.textContent ?? "").includes(label)
  );
  if (!found) throw new Error(`Missing button ${label}`);
  return found as HTMLButtonElement;
}

async function fillSignIn(user: string, secret: string): Promise<void> {
  const username = input("sync.destination-username");
  const token = input("sync.destination-token");
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    setter?.call(username, user);
    username.dispatchEvent(new Event("input", { bubbles: true }));
    setter?.call(token, secret);
    token.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

describe("GitLinkControl", () => {
  it("keeps token sign-in unavailable until the link is HTTPS", async () => {
    const rendered = await render("git@example.test:notes.git");

    expect(rendered.textContent).toContain("Paste an HTTPS git link.");
    expect(input("sync.destination-username").disabled).toBe(false);
    expect(button("Save link").disabled).toBe(true);
    expect(button("Update sign-in").disabled).toBe(true);
  });

  it("never renders a credential embedded by an older link field", async () => {
    const onChange = vi.fn();
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
    await act(async () =>
      root?.render(
        <GitLinkControl
          definition={definition}
          value="https://me:secret@example.test/notes.git"
          onChange={onChange}
        />
      )
    );

    expect(input("sync.destination").value).toBe("https://example.test/notes.git");
    expect(host.textContent).not.toContain("secret");
    expect(onChange).toHaveBeenCalledWith("https://example.test/notes.git");
  });

  it("saves a new sign-in without waiting on the round trip in the button label", async () => {
    const rendered = await render("https://github.com/you/notes.git");
    await fillSignIn("you", "secret");
    await act(async () => button("Update sign-in").click());

    expect(saveSyncCredentials).toHaveBeenCalledWith(
      "/notes",
      "https://github.com/you/notes.git",
      "you",
      "secret",
      null,
      null
    );
    expect(saveSettings).toHaveBeenCalled();
    expect(input("sync.destination-token").value).toBe("");
    expect(rendered.textContent).toContain("Sign-in saved. Checking this git link.");
    expect(useSettingsStore.getState().stagedChanges["sync.signInProfile"]).toBe("p-saved");
  });

  it("reuses a selected saved sign-in from Save link without a token", async () => {
    readSignInStatus.mockResolvedValue({
      ...emptyStatus,
      selectedId: "p-saved",
      selected: { ...savedProfile, saved: true },
      profiles: [savedProfile]
    });
    const rendered = await render("https://github.com/you/other.git", "p-saved");
    await act(async () => button("Save link").click());

    expect(saveSyncLink).toHaveBeenCalledWith("/notes", "https://github.com/you/other.git", "p-saved");
    expect(saveSyncCredentials).not.toHaveBeenCalled();
    expect(rendered.textContent).toContain("Git link saved. Checking this git link.");
  });

  it("does not reuse a profile saved for another host", async () => {
    readSignInStatus.mockResolvedValue({
      ...emptyStatus,
      host: "gitlab.com",
      selectedId: "p-saved",
      selected: { ...savedProfile, saved: true },
      profiles: []
    });
    const rendered = await render("https://gitlab.com/you/notes.git", "p-saved");
    await fillSignIn("you", "secret");

    expect(button("Save link").disabled).toBe(true);
    expect(button("Update sign-in").disabled).toBe(true);
    expect(rendered.textContent).toContain("belongs to github.com");
  });

  it("does not store credentials for a link that settings could not save", async () => {
    saveSettings.mockResolvedValue({ success: false, diagnostics: [] });
    const rendered = await render("https://github.com/you/notes.git");
    await fillSignIn("you", "secret");
    await act(async () => button("Update sign-in").click());

    expect(saveSyncCredentials).not.toHaveBeenCalled();
    expect(input("sync.destination-token").value).toBe("secret");
    expect(rendered.textContent).toContain("Fix the highlighted settings");
  });

  it("forgets the selected profile without choosing another one", async () => {
    readSignInStatus.mockResolvedValue({
      ...emptyStatus,
      selectedId: "p-saved",
      selected: { ...savedProfile, saved: true },
      profiles: [savedProfile]
    });
    const rendered = await render("https://github.com/you/notes.git", "p-saved");
    await act(async () => button("Forget sign-in").click());

    expect(forgetSignIn).toHaveBeenCalledWith("p-saved");
    expect(useSettingsStore.getState().stagedChanges["sync.signInProfile"]).toBe("");
    expect(rendered.textContent).toContain("That sign-in was forgotten");
  });
});
