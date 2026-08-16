import { describe, expect, it, vi } from "vitest";

import { DESKTOP_STATE_KEY } from "../settings/desktopState";
import { createDesktopExtensionDirectoryStore } from "./desktopExtensionDirectoryStore";

const gateway = (stored: readonly string[]) => ({
  readAppSettings: vi.fn(async () =>
    JSON.stringify({
      [DESKTOP_STATE_KEY]: { version: 3, developmentExtensionDirectories: stored }
    })
  ),
  writeAppSettings: vi.fn(async () => undefined),
  updateDesktopState: vi.fn(async (update: unknown) =>
    JSON.stringify({ [DESKTOP_STATE_KEY]: { version: 3, ...(update as object) } })
  )
});

describe("createDesktopExtensionDirectoryStore", () => {
  it("loads the stored directory list from desktop state", async () => {
    const api = gateway(["/ext/one"]);
    const store = createDesktopExtensionDirectoryStore(api);

    await expect(store.load()).resolves.toEqual(["/ext/one"]);
  });

  it("saves the directory list through the desktop-state update", async () => {
    const api = gateway([]);
    const store = createDesktopExtensionDirectoryStore(api);

    await store.save(["/ext/one", "/ext/two"]);

    expect(api.updateDesktopState).toHaveBeenCalledWith({
      developmentExtensionDirectories: ["/ext/one", "/ext/two"]
    });
  });
});
