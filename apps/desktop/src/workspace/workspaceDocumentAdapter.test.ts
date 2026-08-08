import { describe, expect, it, vi } from "vitest";

import { appEvents } from "../events/appEvents";
import { createWorkspaceDocumentApi } from "./workspaceDocumentAdapter";

const entry = { relative_path: "a.md", name: "a.md", byte_size: 0, updated_at: null };

describe("workspace document events", () => {
  it("emits note.saved after a successful write", async () => {
    const api = createWorkspaceDocumentApi(vi.fn(async () => entry) as never);
    const saved = vi.fn();
    const subscription = appEvents.on("note.saved", saved);

    await api.writeMarkdownDocument({ rootPath: "/vault", relativePath: "a.md", contents: "x" });

    expect(saved).toHaveBeenCalledWith({ rootPath: "/vault", relativePath: "a.md" });
    subscription.dispose();
  });

  it("emits note.created after a successful create", async () => {
    const api = createWorkspaceDocumentApi(vi.fn(async () => entry) as never);
    const created = vi.fn();
    const subscription = appEvents.on("note.created", created);

    await api.createMarkdownDocument({ rootPath: "/vault", relativePath: "b.md" });

    expect(created).toHaveBeenCalledWith({ rootPath: "/vault", relativePath: "b.md" });
    subscription.dispose();
  });

  it("emits nothing when the native write fails", async () => {
    const api = createWorkspaceDocumentApi(
      vi.fn(async () => {
        throw new Error("disk full");
      }) as never
    );
    const saved = vi.fn();
    const subscription = appEvents.on("note.saved", saved);

    await expect(
      api.writeMarkdownDocument({ rootPath: "/vault", relativePath: "a.md", contents: "x" })
    ).rejects.toThrow("disk full");

    expect(saved).not.toHaveBeenCalled();
    subscription.dispose();
  });
});
