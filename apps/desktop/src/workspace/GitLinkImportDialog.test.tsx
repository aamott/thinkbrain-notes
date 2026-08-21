// @vitest-environment happy-dom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SignInStatus } from "../sync/historyTypes";
import type { GitLinkPreview, ImportStarted, WorkspaceImportProgress } from "./gitLinkImport";

const previewWorkspaceFromGitLink = vi.fn<(destination: string, parentPath: string) => Promise<GitLinkPreview>>();
const importWorkspaceFromGitLink = vi.fn<
  (destination: string, parentPath: string, profileId?: string | null) => Promise<ImportStarted>
>();
const subscribeToWorkspaceImport = vi.fn<(onEvent: (payload: WorkspaceImportProgress) => void) => Promise<() => void>>();
const readSignInStatus = vi.fn<(rootPath: string, destination: string, profileId?: string | null) => Promise<SignInStatus>>();
const saveSyncCredentials = vi.fn<
  (
    rootPath: string,
    destination: string,
    username: string,
    token: string,
    profileId?: string | null,
    label?: string | null
  ) => Promise<{ readonly profile: { readonly id: string; readonly label: string; readonly host: string; readonly username: string }; readonly migrated: boolean }>
>();
const pickDirectoryPath = vi.fn<(title: string) => Promise<string | null>>();

vi.mock("./gitLinkImport", () => ({
  previewWorkspaceFromGitLink: (destination: string, parentPath: string) =>
    previewWorkspaceFromGitLink(destination, parentPath),
  importWorkspaceFromGitLink: (destination: string, parentPath: string, profileId?: string | null) =>
    importWorkspaceFromGitLink(destination, parentPath, profileId),
  subscribeToWorkspaceImport: (onEvent: (payload: WorkspaceImportProgress) => void) =>
    subscribeToWorkspaceImport(onEvent)
}));

vi.mock("../sync/syncService", () => ({
  readSignInStatus: (rootPath: string, destination: string, profileId?: string | null) =>
    readSignInStatus(rootPath, destination, profileId),
  saveSyncCredentials: (
    rootPath: string,
    destination: string,
    username: string,
    token: string,
    profileId?: string | null,
    label?: string | null
  ) => saveSyncCredentials(rootPath, destination, username, token, profileId, label)
}));

vi.mock("../native/dialogs", () => ({
  pickDirectoryPath: (title: string) => pickDirectoryPath(title)
}));

const { GitLinkImportDialog } = await import("./GitLinkImportDialog");

let root: Root | null = null;
let host: HTMLDivElement | null = null;
let importListener: ((payload: WorkspaceImportProgress) => void) | null = null;

const emptyStatus: SignInStatus = {
  storage: "available",
  storageMessage: "This computer can keep a sign-in.",
  host: "github.com",
  selectedId: null,
  selected: null,
  profiles: [],
  legacy: null
};

async function renderDialog(onClose = vi.fn()) {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => {
    root?.render(<GitLinkImportDialog onClose={onClose} />);
  });
  await act(async () => undefined);
  return onClose;
}

async function click(element: Element) {
  await act(async () => {
    element.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
  });
}

async function typeInto(element: HTMLInputElement, value: string) {
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    setter?.call(element, value);
    element.dispatchEvent(new Event("input", { bubbles: true }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

beforeEach(() => {
  importListener = null;
  previewWorkspaceFromGitLink.mockReset().mockResolvedValue({
    childName: "notes",
    targetPath: "/home/you/notes"
  });
  importWorkspaceFromGitLink.mockReset().mockResolvedValue({
    requestId: "imp-1",
    targetPath: "/home/you/notes"
  });
  subscribeToWorkspaceImport.mockReset().mockImplementation(async (onEvent) => {
    importListener = onEvent;
    return () => undefined;
  });
  readSignInStatus.mockReset().mockResolvedValue(emptyStatus);
  pickDirectoryPath.mockReset().mockResolvedValue("/home/you");
});

afterEach(async () => {
  await act(async () => root?.unmount());
  host?.remove();
  root = null;
  host = null;
});

describe("GitLinkImportDialog", () => {
  it("is an accessible focused dialog", async () => {
    await renderDialog();
    const dialog = host?.querySelector("[role='dialog']");
    expect(dialog?.getAttribute("aria-modal")).toBe("true");
    expect(dialog?.getAttribute("aria-labelledby")).toBeTruthy();
    expect(document.activeElement?.id).toBe("git-link-import-url");
  });

  it("picks a parent folder and shows the native child-folder preview", async () => {
    await renderDialog();
    await typeInto(
      host!.querySelector("#git-link-import-url") as HTMLInputElement,
      "https://github.com/you/notes.git"
    );
    await click(host!.querySelector("button") as HTMLButtonElement);
    expect(pickDirectoryPath).toHaveBeenCalledWith("Choose a parent folder");
    await act(async () => undefined);
    expect(previewWorkspaceFromGitLink).toHaveBeenCalledWith("https://github.com/you/notes.git", "/home/you");
    expect(host?.textContent).toContain("New folder: notes");
  });

  it("lists host-filtered profiles and allows public import with no profile", async () => {
    readSignInStatus.mockResolvedValue({
      ...emptyStatus,
      profiles: [
        { id: "p-gh", label: "you@github.com", host: "github.com", username: "you" }
      ]
    });
    await renderDialog();
    await typeInto(
      host!.querySelector("#git-link-import-url") as HTMLInputElement,
      "https://github.com/you/notes.git"
    );
    await act(async () => undefined);
    const select = host!.querySelector("#git-link-import-profile") as HTMLSelectElement;
    expect(select.textContent).toContain("No sign-in (public or local)");
    expect(select.textContent).toContain("you@github.com");
    expect(readSignInStatus).toHaveBeenCalledWith("", "https://github.com/you/notes.git", null);
  });

  it("keeps a missing selected profile rather than picking another", async () => {
    const gone = { id: "p-gone", label: "gone@github.com", host: "github.com", username: "gone" };
    const other = { id: "p-other", label: "other@github.com", host: "github.com", username: "other" };
    readSignInStatus.mockImplementation(async (_root, _destination, id) => {
      if (id === "p-gone") {
        return {
          ...emptyStatus,
          selectedId: "p-gone",
          selected: { ...gone, saved: false },
          profiles: [other]
        };
      }
      return { ...emptyStatus, profiles: [gone, other] };
    });
    await renderDialog();
    await typeInto(
      host!.querySelector("#git-link-import-url") as HTMLInputElement,
      "https://github.com/you/notes.git"
    );
    await act(async () => undefined);
    const select = host!.querySelector("#git-link-import-profile") as HTMLSelectElement;
    await act(async () => {
      select.value = "p-gone";
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await act(async () => undefined);
    expect(select.value).toBe("p-gone");
    expect(host?.textContent).toMatch(/not available/);
    expect(select.value).not.toBe("p-other");
  });

  it("shows validation for a token in the link", async () => {
    await renderDialog();
    await typeInto(
      host!.querySelector("#git-link-import-url") as HTMLInputElement,
      "https://you:secret@github.com/you/notes.git"
    );
    expect(host?.textContent).toMatch(/token/);
  });

  it("prevents a second submit while import is running and renders phases", async () => {
    let finish!: (value: ImportStarted) => void;
    importWorkspaceFromGitLink.mockReturnValueOnce(
      new Promise((resolve) => {
        finish = resolve;
      })
    );
    await renderDialog();
    await typeInto(
      host!.querySelector("#git-link-import-url") as HTMLInputElement,
      "https://github.com/you/notes.git"
    );
    await click([...host!.querySelectorAll("button")].find((button) => button.textContent === "Browse…")!);
    await act(async () => undefined);
    const bringIn = [...host!.querySelectorAll("button")].find((button) => button.textContent === "Bring in")!;
    await click(bringIn);
    await click(bringIn);
    expect(importWorkspaceFromGitLink).toHaveBeenCalledOnce();
    expect(host?.getAttribute("aria-busy") ?? host?.querySelector("[aria-busy='true']")).toBeTruthy();
    finish({ requestId: "imp-1", targetPath: "/home/you/notes" });
    await act(async () => undefined);
    await act(async () => {
      importListener?.({
        requestId: "imp-1",
        state: "checking",
        phase: "checking",
        targetPath: "/home/you/notes"
      });
    });
    expect(host?.textContent).toContain("Checking for updates");
    await act(async () => {
      importListener?.({
        requestId: "imp-1",
        state: "combining",
        phase: "combining",
        targetPath: "/home/you/notes"
      });
    });
    expect(host?.textContent).toContain("Combining changes");
    await act(async () => {
      importListener?.({
        requestId: "imp-1",
        state: "sending",
        phase: "sending",
        targetPath: "/home/you/notes"
      });
    });
    expect(host?.textContent).toContain("Sending changes");
  });

  it("closes on success without opening a second workspace window", async () => {
    const onClose = await renderDialog();
    await typeInto(
      host!.querySelector("#git-link-import-url") as HTMLInputElement,
      "https://github.com/you/notes.git"
    );
    await click([...host!.querySelectorAll("button")].find((button) => button.textContent === "Browse…")!);
    await act(async () => undefined);
    await click([...host!.querySelectorAll("button")].find((button) => button.textContent === "Bring in")!);
    await act(async () => undefined);
    await act(async () => {
      importListener?.({
        requestId: "imp-1",
        state: "ok",
        targetPath: "/home/you/notes"
      });
    });
    expect(onClose).toHaveBeenCalledOnce();
    expect(host?.textContent).not.toContain("openWorkspaceWindow");
  });

  it("does not miss completion that arrives before the start command returns", async () => {
    importWorkspaceFromGitLink.mockImplementationOnce(async () => {
      importListener?.({
        requestId: "imp-fast",
        state: "ok",
        targetPath: "/home/you/notes"
      });
      return { requestId: "imp-fast", targetPath: "/home/you/notes" };
    });
    const onClose = await renderDialog();
    await typeInto(
      host!.querySelector("#git-link-import-url") as HTMLInputElement,
      "https://github.com/you/notes.git"
    );
    await click([...host!.querySelectorAll("button")].find((button) => button.textContent === "Browse…")!);
    await act(async () => undefined);
    await click([...host!.querySelectorAll("button")].find((button) => button.textContent === "Bring in")!);

    expect(onClose).toHaveBeenCalledOnce();
  });

  it("keeps the dialog open on failure and names a recovery action", async () => {
    const onClose = await renderDialog();
    await typeInto(
      host!.querySelector("#git-link-import-url") as HTMLInputElement,
      "https://github.com/you/notes.git"
    );
    await click([...host!.querySelectorAll("button")].find((button) => button.textContent === "Browse…")!);
    await act(async () => undefined);
    await click([...host!.querySelectorAll("button")].find((button) => button.textContent === "Bring in")!);
    await act(async () => undefined);
    await act(async () => {
      importListener?.({
        requestId: "imp-1",
        state: "failed",
        targetPath: "/home/you/notes",
        error: {
          code: "sync.import_target_exists",
          message: "A folder with that name is already there."
        }
      });
    });
    expect(onClose).not.toHaveBeenCalled();
    expect(host?.textContent).toContain("already there");
    expect(host?.textContent).toMatch(/parent folder/);
    expect([...host!.querySelectorAll("button")].some((button) => button.textContent === "Bring in")).toBe(true);
  });

  it("ignores progress for a different request", async () => {
    const onClose = await renderDialog();
    await typeInto(
      host!.querySelector("#git-link-import-url") as HTMLInputElement,
      "https://github.com/you/notes.git"
    );
    await click([...host!.querySelectorAll("button")].find((button) => button.textContent === "Browse…")!);
    await act(async () => undefined);
    await click([...host!.querySelectorAll("button")].find((button) => button.textContent === "Bring in")!);
    await act(async () => undefined);
    await act(async () => {
      importListener?.({
        requestId: "someone-else",
        state: "ok",
        targetPath: "/other"
      });
    });
    expect(onClose).not.toHaveBeenCalled();
  });

  it("allows creating a new sign-in profile in the dialog and brings in with it", async () => {
    saveSyncCredentials.mockResolvedValueOnce({
      profile: {
        id: "p-new-123",
        label: "adam@github.com",
        host: "github.com",
        username: "adam"
      },
      migrated: false
    });
    await renderDialog();
    await typeInto(
      host!.querySelector("#git-link-import-url") as HTMLInputElement,
      "https://github.com/you/notes.git"
    );
    await click([...host!.querySelectorAll("button")].find((button) => button.textContent === "Browse…")!);
    await act(async () => undefined);

    const select = host!.querySelector("#git-link-import-profile") as HTMLSelectElement;
    await act(async () => {
      select.value = "new";
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await act(async () => undefined);

    const usernameInput = host!.querySelector("#git-link-import-username") as HTMLInputElement;
    const tokenInput = host!.querySelector("#git-link-import-token") as HTMLInputElement;
    expect(usernameInput).toBeTruthy();
    expect(tokenInput).toBeTruthy();

    const bringInButton = [...host!.querySelectorAll("button")].find((button) => button.textContent === "Bring in")!;
    expect(bringInButton.disabled).toBe(true);

    await typeInto(usernameInput, "adam");
    await typeInto(tokenInput, "ghp_secret123");
    expect(bringInButton.disabled).toBe(false);

    await click(bringInButton);
    await act(async () => undefined);

    expect(saveSyncCredentials).toHaveBeenCalledWith(
      "",
      "https://github.com/you/notes.git",
      "adam",
      "ghp_secret123",
      null,
      null
    );
    expect(importWorkspaceFromGitLink).toHaveBeenCalledWith(
      "https://github.com/you/notes.git",
      "/home/you",
      "p-new-123"
    );
  });

  it("shows an honest message when a host has no saved profiles yet", async () => {
    readSignInStatus.mockResolvedValueOnce({
      ...emptyStatus,
      host: "gitlab.com",
      profiles: []
    });
    await renderDialog();
    await typeInto(
      host!.querySelector("#git-link-import-url") as HTMLInputElement,
      "https://gitlab.com/group/notes.git"
    );
    await act(async () => undefined);
    expect(host?.textContent).toContain("No saved sign-ins for gitlab.com yet.");
  });

  it("surfaces storage errors from readSignInStatus", async () => {
    readSignInStatus.mockResolvedValueOnce({
      ...emptyStatus,
      storage: "unavailable",
      storageMessage: "The keychain is locked."
    });
    await renderDialog();
    await typeInto(
      host!.querySelector("#git-link-import-url") as HTMLInputElement,
      "https://github.com/you/notes.git"
    );
    await act(async () => undefined);
    expect(host?.textContent).toContain("The keychain is locked.");
  });
});

