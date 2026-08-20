// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SettingDefinition } from "@thinkbrain/core";
import { useSettingsStore } from "../settingsStore";

const saveSyncCredentials = vi.fn<
  (rootPath: string, destination: string, username: string, token: string) => Promise<unknown>
>();
const saveSettings = vi.fn<() => Promise<{ success: boolean; diagnostics: [] }>>();

vi.mock("../../sync/syncService", () => ({
  saveSyncCredentials: (rootPath: string, destination: string, username: string, token: string) =>
    saveSyncCredentials(rootPath, destination, username, token)
}));

const { GitLinkControl } = await import("./GitLinkControl");

let root: Root | null = null;
let host: HTMLDivElement | null = null;

beforeEach(() => {
  saveSyncCredentials.mockReset().mockResolvedValue({});
  saveSettings.mockReset().mockResolvedValue({ success: true, diagnostics: [] });
});

afterEach(async () => {
  await act(async () => root?.unmount());
  host?.remove();
  root = null;
  host = null;
  useSettingsStore.setState({ workspaceRootPath: null });
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

async function render(value: string) {
  useSettingsStore.setState({ workspaceRootPath: "/notes", saveSettings });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root?.render(<GitLinkControl definition={definition} value={value} onChange={() => undefined} />));
  return host;
}

function input(id: string): HTMLInputElement {
  const found = host?.querySelector<HTMLInputElement>(`#${CSS.escape(id)}`);
  if (!found) throw new Error(`Missing input ${id}`);
  return found;
}

describe("GitLinkControl", () => {
  it("keeps token sign-in unavailable until the link is HTTPS", async () => {
    const rendered = await render("git@example.test:notes.git");

    expect(rendered.textContent).toContain("Paste an HTTPS git link.");
    expect(input("sync.destination-username").disabled).toBe(false);
    expect((rendered.querySelector("button") as HTMLButtonElement).disabled).toBe(true);
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

  it("sends username and token directly to the keychain command", async () => {
    const rendered = await render("https://github.com/you/notes.git");
    const username = input("sync.destination-username");
    const token = input("sync.destination-token");

    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
      setter?.call(username, "you");
      username.dispatchEvent(new Event("input", { bubbles: true }));
      setter?.call(token, "secret");
      token.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => (rendered.querySelector("button") as HTMLButtonElement).click());

    expect(saveSyncCredentials).toHaveBeenCalledWith(
      "/notes",
      "https://github.com/you/notes.git",
      "you",
      "secret"
    );
    expect(saveSettings).toHaveBeenCalledOnce();
    expect(token.value).toBe("");
    expect(rendered.textContent).toContain("Git link and sign-in saved. This git link was checked.");
  });

  it("does not store credentials for a link that settings could not save", async () => {
    saveSettings.mockResolvedValue({ success: false, diagnostics: [] });
    const rendered = await render("https://github.com/you/notes.git");
    const username = input("sync.destination-username");
    const token = input("sync.destination-token");

    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
      setter?.call(username, "you");
      username.dispatchEvent(new Event("input", { bubbles: true }));
      setter?.call(token, "secret");
      token.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => (rendered.querySelector("button") as HTMLButtonElement).click());

    expect(saveSyncCredentials).not.toHaveBeenCalled();
    expect(token.value).toBe("secret");
    expect(rendered.textContent).toContain("Fix the highlighted settings");
  });
});
