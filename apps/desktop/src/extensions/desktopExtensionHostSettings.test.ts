import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Isolated in its own file so the native mock cannot leak into the host's other
// tests, which never touch the settings gateway.
vi.mock("../native/commands", () => ({
  invokeNativeCommand: vi.fn<() => Promise<unknown>>()
}));

import { invokeNativeCommand } from "../native/commands";
import { useSettingsStore } from "../settings/settingsStore";
import { createDesktopExtensionHost, type DesktopExtensionContext } from "./desktopExtensionHost";

/**
 * D81: an extension's `settings.set` persists.
 *
 * Extensions have no Save bar to press, so a write that only staged would
 * evaporate on quit unless the user happened to have autosave on.
 */

const invoked = vi.mocked(invokeNativeCommand);

const schema = {
  label: "Persisting extension",
  scope: "app" as const,
  sections: [{
    id: "section",
    label: "Test",
    settings: [{
      key: "enabled",
      type: "boolean" as const,
      label: "Enabled",
      description: "Whether the test extension is enabled.",
      default: false,
      scope: "app" as const,
      section: "section"
    }]
  }]
};

let host: ReturnType<typeof createDesktopExtensionHost> | null = null;

beforeEach(() => {
  invoked.mockReset();
  invoked.mockResolvedValue(null);
  useSettingsStore.setState({
    appValues: {},
    workspaceValues: null,
    workspaceRootPath: null,
    stagedChanges: {},
    isDirty: false,
    dirtyCount: 0
  });
});

afterEach(async () => {
  await host?.dispose();
  host = null;
});

const activate = async (): Promise<DesktopExtensionContext> => {
  host = createDesktopExtensionHost();
  let context: DesktopExtensionContext | undefined;
  host.register({
    id: "persisting",
    trusted: true,
    activate: (activationContext) => {
      context = activationContext;
      activationContext.settings.registerSchema(schema);
    }
  });
  await host.activate("persisting");
  if (!context) throw new Error("Activation did not yield a context.");
  return context;
};

describe("extension settings writes (D81)", () => {
  it("persists rather than staging, because an extension has no Save bar", async () => {
    const context = await activate();

    await context.settings.set("enabled", true);

    const write = invoked.mock.calls.find(([command]) => command === "write_app_settings");
    expect(write).toBeDefined();
    expect(JSON.parse((write?.[1] as { contents: string }).contents)).toMatchObject({
      "extension-persisting.enabled": true
    });
    expect(useSettingsStore.getState().stagedChanges).toEqual({});
    expect(context.settings.get<boolean>("enabled")).toBe(true);
  });

  it("keeps the value readable when the write fails, so the session still honours it", async () => {
    const context = await activate();
    invoked.mockRejectedValue(new Error("disk is full"));
    const errors = vi.spyOn(console, "error").mockImplementation(() => undefined);

    await context.settings.set("enabled", true);

    expect(context.settings.get<boolean>("enabled")).toBe(true);
    errors.mockRestore();
  });

  // Synchronously, not as a rejection: a foreign key is a programming error, and
  // an extension that never awaits the write should still fail loudly.
  it("still refuses writes to another module's keys", async () => {
    const context = await activate();

    expect(() => context.settings.set("appearance.theme", "dark")).toThrow();
    expect(invoked).not.toHaveBeenCalledWith("write_app_settings", expect.anything());
  });
});
