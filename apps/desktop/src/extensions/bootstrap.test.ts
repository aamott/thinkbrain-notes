// @vitest-environment happy-dom
import type { ExtensionManifest } from "@thinkbrain/core";
import { describe, expect, it, vi } from "vitest";

import { createDesktopCommandRegistry, type DesktopCommandContext } from "../commands/commandRegistry";
import { createDesktopPanelRegistry } from "../panels/panelRegistry";
import { bootstrapExtensions } from "./bootstrap";
import type { BuiltInExtension } from "./builtins";
import { createDesktopExtensionHost, type DesktopExtensionContext } from "./desktopExtensionHost";

const manifest = (overrides: Partial<ExtensionManifest> = {}): ExtensionManifest => ({
  id: "sample",
  name: "Sample",
  version: "1.0.0",
  apiVersion: "^1.0.0",
  engines: { platform: ["desktop"] },
  activationEvents: ["onCommand:go"],
  capabilities: [],
  contributes: { commands: [{ id: "go", title: "Go" }], panels: [] },
  ...overrides
});

const setup = (extension: BuiltInExtension) => {
  const commands = createDesktopCommandRegistry([]);
  const panels = createDesktopPanelRegistry([]);
  const host = createDesktopExtensionHost({ commands, panels });
  const boot = bootstrapExtensions({ host, commands, panels, extensions: [extension] });
  return { commands, panels, host, boot };
};

const commandContext = {} as DesktopCommandContext;

describe("bootstrapExtensions", () => {
  it("registers a stub command without activating the extension", () => {
    const activate = vi.fn();
    const { commands, boot } = setup({ manifest: manifest(), activate });

    expect(commands.get("sample.go")?.title).toBe("Go");
    expect(activate).not.toHaveBeenCalled();
    expect(boot.entries()[0]).toMatchObject({ id: "sample", status: "registered" });
  });

  it("activates on first invoke, then runs the extension's real handler", async () => {
    const realHandler = vi.fn();
    const activate = vi.fn((context: DesktopExtensionContext) => {
      context.commands.register({
        id: "go",
        title: "Go",
        availability: "available",
        handler: realHandler
      });
    });
    const { commands, boot } = setup({ manifest: manifest(), activate });

    await commands.get("sample.go")?.handler(commandContext);

    expect(activate).toHaveBeenCalledTimes(1);
    expect(realHandler).toHaveBeenCalledTimes(1);
    expect(boot.entries()[0]?.status).toBe("active");
  });

  it("activates only once when the stub is invoked concurrently", async () => {
    const activate = vi.fn((context: DesktopExtensionContext) => {
      context.commands.register({
        id: "go",
        title: "Go",
        availability: "available",
        handler: () => undefined
      });
    });
    const { commands } = setup({ manifest: manifest(), activate });
    const stub = commands.get("sample.go")!;

    await Promise.all([stub.handler(commandContext), stub.handler(commandContext)]);

    expect(activate).toHaveBeenCalledTimes(1);
  });

  it("activates eagerly when onStartup is declared", () => {
    const activate = vi.fn();
    setup({ manifest: manifest({ activationEvents: ["onStartup"] }), activate });
    expect(activate).toHaveBeenCalled();
  });

  it("registers a stub panel that preserves the manifest's label and side", () => {
    const { panels } = setup({
      manifest: manifest({
        activationEvents: ["onView:stats"],
        contributes: {
          commands: [],
          panels: [{ id: "stats", label: "Stats", icon: "∑", side: "right" }]
        }
      }),
      activate: vi.fn()
    });

    expect(panels.get("sample.stats")).toMatchObject({ label: "Stats", side: "right", icon: "∑" });
  });

  it("lists an incompatible extension but contributes nothing for it", () => {
    const { commands, boot } = setup({
      manifest: manifest({ apiVersion: "^9.0.0" }),
      activate: vi.fn()
    });

    expect(commands.get("sample.go")).toBeUndefined();
    expect(boot.entries()[0]?.status).toBe("incompatible");
    expect(boot.entries()[0]?.reasons[0]?.code).toBe("api-version");
  });

  it("lists an extension whose manifest does not parse", () => {
    const { boot } = setup({
      manifest: manifest({ id: "Not Valid" as string }),
      activate: vi.fn()
    });

    expect(boot.entries()[0]?.status).toBe("incompatible");
    expect(boot.entries()[0]?.reasons.length).toBeGreaterThan(0);
  });

  it("leaves no stub behind when activation fails", async () => {
    const activate = vi.fn(() => {
      throw new Error("boom");
    });
    const { commands, boot } = setup({ manifest: manifest(), activate });

    await expect(commands.get("sample.go")!.handler(commandContext)).rejects.toThrow();

    expect(boot.entries()[0]?.status).toBe("failed");
    expect(commands.get("sample.go")).toBeUndefined();
  });

  it("disposes stubs on shutdown", async () => {
    const { commands, boot } = setup({ manifest: manifest(), activate: vi.fn() });
    await boot.dispose();
    expect(commands.get("sample.go")).toBeUndefined();
  });
});

describe("locally loaded extensions", () => {
  const local = (activate = vi.fn(), overrides: Partial<ExtensionManifest> = {}) => ({
    directory: "/ext/sample",
    manifest: manifest(overrides),
    activate,
    deactivate: undefined
  });

  const empty = () => {
    const commands = createDesktopCommandRegistry([]);
    const panels = createDesktopPanelRegistry([]);
    const host = createDesktopExtensionHost({ commands, panels });
    const boot = bootstrapExtensions({ host, commands, panels, extensions: [] });
    return { commands, panels, host, boot };
  };

  it("stubs a locally loaded extension's commands without activating it", () => {
    const { commands, boot } = empty();
    const activate = vi.fn();

    boot.addLocalExtension(local(activate), []);

    expect(commands.get("sample.go")?.title).toBe("Go");
    expect(activate).not.toHaveBeenCalled();
    expect(boot.entries()[0]).toMatchObject({
      id: "sample",
      status: "registered",
      source: "local-directory",
      directory: "/ext/sample"
    });
  });

  it("notifies subscribers when a local extension is added", () => {
    const { boot } = empty();
    let notifications = 0;
    boot.subscribe(() => {
      notifications += 1;
    });

    boot.addLocalExtension(local(), []);

    expect(notifications).toBeGreaterThan(0);
  });

  it("activates a locally loaded extension through its stub", async () => {
    const realHandler = vi.fn();
    const activate = vi.fn((context: DesktopExtensionContext) => {
      context.commands.register({
        id: "go",
        title: "Go",
        availability: "available",
        handler: realHandler
      });
    });
    const { commands, boot } = empty();
    boot.addLocalExtension(local(activate), []);

    await commands.get("sample.go")?.handler(commandContext);

    expect(realHandler).toHaveBeenCalledTimes(1);
    expect(boot.entries()[0]?.status).toBe("active");
  });

  it("removes every registration a local extension owned", async () => {
    const activate = vi.fn((context: DesktopExtensionContext) => {
      context.commands.register({
        id: "go",
        title: "Go",
        availability: "available",
        handler: vi.fn()
      });
    });
    const { commands, boot } = empty();
    boot.addLocalExtension(local(activate), []);
    await commands.get("sample.go")?.handler(commandContext);

    await boot.removeLocalExtension("sample");

    expect(commands.get("sample.go")).toBeUndefined();
    expect(boot.entries()).toEqual([]);
  });

  it("removes an extension that was never activated", async () => {
    const { commands, boot } = empty();
    boot.addLocalExtension(local(), []);

    await boot.removeLocalExtension("sample");

    expect(commands.get("sample.go")).toBeUndefined();
  });

  /**
   * Reload is remove-then-add. The old registrations must be gone before the
   * replacement activates, or the second registration collides on the same id.
   */
  it("re-registers cleanly when the same directory is loaded again", async () => {
    const { commands, boot } = empty();
    const first = vi.fn((context: DesktopExtensionContext) => {
      context.commands.register({
        id: "go",
        title: "Go",
        availability: "available",
        handler: vi.fn()
      });
    });
    boot.addLocalExtension(local(first), []);
    await commands.get("sample.go")?.handler(commandContext);

    await boot.removeLocalExtension("sample");
    const second = vi.fn();
    boot.addLocalExtension(local(second), []);

    expect(commands.get("sample.go")?.title).toBe("Go");
    expect(boot.entries()[0]?.status).toBe("registered");
  });

  it("surfaces load diagnostics on the entry", () => {
    const { boot } = empty();

    boot.addLocalExtension(local(), [
      { code: "panels_not_supported", message: "Panels are not loaded yet.", severity: "warning" }
    ]);

    expect(boot.entries()[0]?.reasons[0]?.message).toBe("Panels are not loaded yet.");
  });

  it("rejects a local extension whose id is already registered", () => {
    const { boot } = empty();
    boot.addLocalExtension(local(), []);

    expect(() => boot.addLocalExtension(local(), [])).toThrow(/already/i);
  });

  it("disposes locally loaded extensions on shutdown", async () => {
    const { commands, boot } = empty();
    boot.addLocalExtension(local(), []);

    await boot.dispose();

    expect(commands.get("sample.go")).toBeUndefined();
  });
});

describe("settings need every extension awake", () => {
  /**
   * A lazy extension registers its settings schema when it activates, so a
   * Settings page that never woke it shows a gap where its section should be —
   * and the user cannot configure what they cannot see.
   */
  it("activates a lazily-registered extension on demand", async () => {
    const activate = vi.fn();
    const { boot } = setup({ manifest: manifest(), activate });
    expect(activate).not.toHaveBeenCalled();

    await boot.activateAll();

    expect(activate).toHaveBeenCalled();
  });

  it("activates each extension only once, however often it is asked", async () => {
    const activate = vi.fn();
    const { boot } = setup({ manifest: manifest(), activate });

    await boot.activateAll();
    await boot.activateAll();

    expect(activate).toHaveBeenCalledTimes(1);
  });

  it("keeps going when one extension fails to activate", async () => {
    const activate = vi.fn(() => {
      throw new Error("nope");
    });
    const { boot } = setup({ manifest: manifest(), activate });

    await expect(boot.activateAll()).resolves.toBeUndefined();
    expect(boot.entries()[0]).toMatchObject({ status: "failed" });
  });

  it("leaves an incompatible extension alone", async () => {
    const activate = vi.fn();
    const { boot } = setup({
      manifest: manifest({ engines: { platform: ["mobile"] } }),
      activate
    });

    await boot.activateAll();

    expect(activate).not.toHaveBeenCalled();
  });
});
