// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { resetNotificationStore, useNotificationStore } from "../notifications/notificationStore";
import {
  SETTINGS_QUARANTINE_SOURCE,
  useSettingsQuarantineAdapter
} from "./settingsQuarantineAdapter";

const invokeNativeCommand = vi.fn<() => Promise<readonly string[]>>();

vi.mock("../native/commands", () => ({
  invokeNativeCommand: () => invokeNativeCommand()
}));

let root: Root | null = null;
let host: HTMLDivElement | null = null;

beforeEach(() => {
  invokeNativeCommand.mockReset();
  resetNotificationStore();
});

afterEach(async () => {
  await act(async () => root?.unmount());
  host?.remove();
  root = null;
  host = null;
});

async function mountAdapter(): Promise<void> {
  function Host() {
    useSettingsQuarantineAdapter();
    return null;
  }
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => {
    root?.render(<Host />);
  });
}

describe("telling the user their settings were set aside", () => {
  it("says nothing on an ordinary launch", async () => {
    invokeNativeCommand.mockResolvedValue([]);
    await mountAdapter();

    expect(useNotificationStore.getState().notifications).toHaveLength(0);
  });

  it("stays on screen until dismissed, because the file is only recoverable while known about", async () => {
    invokeNativeCommand.mockResolvedValue(["/app-data/settings/app.corrupt.json"]);
    await mountAdapter();

    const [announced] = useNotificationStore.getState().notifications;
    expect(announced?.source).toBe(SETTINGS_QUARANTINE_SOURCE);
    expect(announced?.severity).toBe("sticky");
    expect(announced?.title).toBe("A settings file could not be read");
    // The path is the one thing worth copying, and the bell log offers Copy.
    expect(announced?.details).toBe("/app-data/settings/app.corrupt.json");
  });

  it("does not claim anything was deleted, because nothing was", async () => {
    invokeNativeCommand.mockResolvedValue(["/app-data/settings/app.corrupt.json"]);
    await mountAdapter();

    expect(useNotificationStore.getState().notifications[0]?.message).toContain(
      "Nothing was deleted"
    );
  });

  it("counts them when more than one was set aside", async () => {
    invokeNativeCommand.mockResolvedValue(["/a/app.corrupt.json", "/a/workspace.corrupt.json"]);
    await mountAdapter();

    expect(useNotificationStore.getState().notifications[0]?.title).toBe(
      "2 settings files could not be read"
    );
  });

  it("stays quiet when it cannot ask", async () => {
    invokeNativeCommand.mockRejectedValue(new Error("bridge unavailable"));
    await mountAdapter();

    expect(useNotificationStore.getState().notifications).toHaveLength(0);
  });
});
