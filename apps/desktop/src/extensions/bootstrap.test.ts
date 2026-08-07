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
