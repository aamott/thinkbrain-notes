// @vitest-environment happy-dom
import { DisposableError, type ExtensionManifest } from "@thinkbrain/core";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createDesktopCommandRegistry, type DesktopCommandContext } from "../commands/commandRegistry";
import { createMobileNewNoteActionRegistry } from "../commands/mobileNewNoteActionRegistry";
import { createDesktopPanelRegistry } from "../panels/panelRegistryModel";
import { bootstrapExtensions } from "./bootstrap";
import { getExtensionBootstrap, setExtensionBootstrap } from "./bootstrapRef";
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
  const actions = createMobileNewNoteActionRegistry();
  const host = createDesktopExtensionHost({ commands, panels });
  const boot = bootstrapExtensions({
    host,
    commands,
    panels,
    mobileNewNoteActions: actions,
    extensions: [extension]
  });
  return { commands, panels, actions, host, boot };
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

  it("preserves the manifest diagnostic's own code instead of relabeling it as a capability reason", () => {
    const { boot } = setup({
      manifest: manifest({ id: "Not Valid" as string }),
      activate: vi.fn()
    });

    expect(boot.entries()[0]?.reasons[0]?.code).toBe("manifest_invalid_id");
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

describe("lazy panel placeholders", () => {
  const panelManifest = (): ExtensionManifest =>
    manifest({
      activationEvents: ["onView:stats"],
      contributes: {
        commands: [],
        panels: [{ id: "stats", label: "Stats", icon: "∑", side: "right" }]
      }
    });

  /**
   * Regression: the stub used to be disposed before `activate` ran, so the
   * registry notified subscribers mid-activation and the popout unmounted the
   * placeholder into "not registered". The stub must hold the id for the whole
   * window; the real panel swaps it out inside its own registration.
   */
  it("keeps the panel stub registered through the whole activation window", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const activate = vi.fn(async (context: DesktopExtensionContext) => {
      await gate;
      context.panels.register({
        id: "stats",
        label: "Stats",
        icon: "∑",
        side: "right",
        factory: () => null
      });
    });
    const { panels, boot } = setup({ manifest: panelManifest(), activate });

    const activation = boot.activate!("sample");

    // Mid-activation the id still resolves to the placeholder — this is the
    // moment the popout used to lose it.
    expect(panels.get("sample.stats")).toMatchObject({ label: "Stats", placeholder: true });

    release();
    await activation;

    const real = panels.get("sample.stats");
    expect(real?.placeholder).toBeUndefined();
    // The swap preserved the stub's ordering slot rather than appending.
    expect(panels.entriesBySide("right").map((panel) => panel.id)).toEqual(["sample.stats"]);
  });

  it("keeps the placeholder after a failed activation so the failure UI stays reachable", async () => {
    const activate = vi.fn(async () => {
      throw new Error("boom");
    });
    const { panels, boot } = setup({ manifest: panelManifest(), activate });
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    try {
      await expect(boot.activate!("sample")).rejects.toThrow();

      expect(boot.entries()[0]?.status).toBe("failed");
      // Unlike command stubs, the panel stub survives failure: it is what
      // renders the "failed to start" message in the popout.
      expect(panels.get("sample.stats")?.placeholder).toBe(true);
    } finally {
      spy.mockRestore();
    }
  });

  it("rejects activation for an id no extension is registered under", async () => {
    const { boot } = setup({ manifest: panelManifest(), activate: vi.fn() });

    await expect(boot.activate!("missing-extension")).rejects.toThrow(/not registered/i);
  });
});

describe("mobile New-note actions", () => {
  const withAction = (activate: BuiltInExtension["activate"]): BuiltInExtension => ({
    manifest: manifest(),
    activate,
    mobileNewNoteActions: [
      {
        id: "brew",
        commandId: "go",
        label: "Brew a note",
        icon: "coffee",
        requiresWorkspace: true
      }
    ]
  });

  it("registers the action before activation, under fully qualified ids", () => {
    const activate = vi.fn();
    const { actions } = setup(withAction(activate));

    expect(actions.get("sample.brew")).toMatchObject({
      commandId: "sample.go",
      label: "Brew a note",
      icon: "coffee",
      requiresWorkspace: true
    });
    expect(activate).not.toHaveBeenCalled();
  });

  it("survives successful lazy activation while the command stub swaps", async () => {
    const activate = vi.fn((context: DesktopExtensionContext) => {
      context.commands.register({
        id: "go",
        title: "Go",
        availability: "available",
        handler: () => undefined
      });
    });
    const { actions, commands } = setup(withAction(activate));

    await commands.get("sample.go")?.handler(commandContext);

    expect(activate).toHaveBeenCalledTimes(1);
    expect(actions.get("sample.brew")?.commandId).toBe("sample.go");
  });

  it("removes the action when activation fails", async () => {
    const activate = vi.fn(() => {
      throw new Error("boom");
    });
    const { actions, commands } = setup(withAction(activate));

    await expect(commands.get("sample.go")!.handler(commandContext)).rejects.toThrow();

    expect(actions.get("sample.brew")).toBeUndefined();
  });

  it("registers each descriptor action exactly once", () => {
    const { actions } = setup(withAction(vi.fn()));

    expect(actions.entries().map((entry) => entry.id)).toEqual(["sample.brew"]);
  });

  it("throws on duplicate action ids without leaking the first registration", () => {
    // Registration is transactional: the duplicate's throw must not strand
    // the earlier action in the injected registry.
    const commands = createDesktopCommandRegistry([]);
    const panels = createDesktopPanelRegistry([]);
    const actions = createMobileNewNoteActionRegistry();
    const host = createDesktopExtensionHost({ commands, panels });
    const duplicated: BuiltInExtension = {
      manifest: manifest(),
      activate: vi.fn(),
      mobileNewNoteActions: [
        { id: "brew", commandId: "go", label: "Brew a note", icon: "coffee" },
        { id: "brew", commandId: "go", label: "Brew again", icon: "coffee" }
      ]
    };

    expect(() =>
      bootstrapExtensions({
        host,
        commands,
        panels,
        mobileNewNoteActions: actions,
        extensions: [duplicated]
      })
    ).toThrow();
    expect(actions.entries()).toHaveLength(0);
  });

  it("disposes actions on bootstrap shutdown", async () => {
    const { actions, boot } = setup(withAction(vi.fn()));
    expect(actions.entries()).toHaveLength(1);

    await boot.dispose();
    expect(actions.entries()).toHaveLength(0);
  });

  it("registers nothing for a built-in that declares no actions", () => {
    const { actions } = setup({ manifest: manifest(), activate: vi.fn() });

    expect(actions.entries()).toHaveLength(0);
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
    const actions = createMobileNewNoteActionRegistry();
    const host = createDesktopExtensionHost({ commands, panels });
    const boot = bootstrapExtensions({
      host,
      commands,
      panels,
      mobileNewNoteActions: actions,
      extensions: []
    });
    return { commands, panels, actions, host, boot };
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

  it("preserves a load diagnostic's own code instead of relabeling it as a capability reason", () => {
    const { boot } = empty();

    boot.addLocalExtension(local(), [
      { code: "panels_not_supported", message: "Panels are not loaded yet.", severity: "warning" }
    ]);

    expect(boot.entries()[0]?.reasons[0]?.code).toBe("panels_not_supported");
  });

  it("runs a local extension's deactivate export when it is removed", async () => {
    const deactivate = vi.fn();
    const activate = vi.fn((context: DesktopExtensionContext) => {
      context.commands.register({
        id: "go",
        title: "Go",
        availability: "available",
        handler: vi.fn()
      });
    });
    const { commands, boot } = empty();
    boot.addLocalExtension({ ...local(activate), deactivate }, []);
    await commands.get("sample.go")?.handler(commandContext);

    await boot.removeLocalExtension("sample");

    expect(deactivate).toHaveBeenCalledTimes(1);
  });

  it("rejects a local extension whose id is already registered", () => {
    const { boot } = empty();
    boot.addLocalExtension(local(), []);

    expect(() => boot.addLocalExtension(local(), [])).toThrow(/already/i);
  });

  /**
   * The compatibility gate lives at the registry boundary, not only in the
   * loader: a `LoadedExtension` produced any other way is still checked.
   */
  it("lists an incompatible local extension but registers nothing for it", () => {
    const { commands, boot } = empty();
    const activate = vi.fn();

    boot.addLocalExtension(local(activate, { apiVersion: "^9.0.0" }), []);

    expect(commands.get("sample.go")).toBeUndefined();
    expect(activate).not.toHaveBeenCalled();
    expect(boot.entries()[0]).toMatchObject({
      id: "sample",
      status: "incompatible",
      source: "local-directory"
    });
    expect(boot.entries()[0]?.reasons.some((reason) => reason.code === "api-version")).toBe(true);
  });

  /**
   * A throw during stub registration — here a manifest declaring the same
   * command id twice — must roll back the whole entry. Otherwise `entries()`
   * never lists the extension while `states` still blocks a retry.
   */
  it("leaves no unreachable entry when stub registration throws", () => {
    const { commands, boot } = empty();
    const duplicated = local(vi.fn(), {
      contributes: {
        commands: [
          { id: "go", title: "Go" },
          { id: "go", title: "Go again" }
        ],
        panels: []
      }
    });

    expect(() => boot.addLocalExtension(duplicated, [])).toThrow(/already registered/i);

    expect(boot.entries()).toEqual([]);
    expect(commands.get("sample.go")).toBeUndefined();

    boot.addLocalExtension(local(), []);
    expect(commands.get("sample.go")?.title).toBe("Go");
  });

  it("disposes locally loaded extensions on shutdown", async () => {
    const { commands, boot } = empty();
    boot.addLocalExtension(local(), []);

    await boot.dispose();

    expect(commands.get("sample.go")).toBeUndefined();
  });
});

describe("missing declared contributions", () => {
  /**
   * A stub activates its extension, which is expected to re-register the
   * declared contribution under the same id. When it does not, the miss is an
   * authoring bug that must be diagnosed, not swallowed.
   */
  it("logs a diagnostic when activation never registers a declared command", async () => {
    const activate = vi.fn();
    const { commands } = setup({ manifest: manifest(), activate });
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    try {
      await commands.get("sample.go")?.handler(commandContext);
      expect(activate).toHaveBeenCalledTimes(1);
      expect(spy).toHaveBeenCalledWith(
        expect.stringContaining("never registered declared command")
      );
    } finally {
      spy.mockRestore();
    }
  });
});

describe("bootstrap dispose", () => {
  /**
   * Shutdown is best-effort across entries: one extension whose teardown
   * rejects must not leave later extensions registered.
   */
  it("disposes every extension and reports the failures afterwards", async () => {
    const commands = createDesktopCommandRegistry([]);
    const panels = createDesktopPanelRegistry([]);
    const host = createDesktopExtensionHost({ commands, panels });
    const boot = bootstrapExtensions({ host, commands, panels, extensions: [] });
    const activate = vi.fn((context: DesktopExtensionContext) => {
      context.commands.register({
        id: "go",
        title: "Go",
        availability: "available",
        handler: vi.fn()
      });
    });
    const failingDeactivate = vi.fn(() => {
      throw new Error("teardown boom");
    });
    boot.addLocalExtension(
      { directory: "/ext/good", manifest: manifest({ id: "good" }), activate, deactivate: undefined },
      []
    );
    boot.addLocalExtension(
      { directory: "/ext/bad", manifest: manifest({ id: "bad" }), activate, deactivate: failingDeactivate },
      []
    );
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    try {
      await commands.get("bad.go")?.handler(commandContext);
      await expect(boot.dispose()).rejects.toBeInstanceOf(DisposableError);
    } finally {
      spy.mockRestore();
    }

    expect(commands.get("good.go")).toBeUndefined();
    expect(commands.get("bad.go")).toBeUndefined();
    expect(boot.entries()).toEqual([]);
  });
});

describe("publication as the app-wide bootstrap", () => {
  afterEach(() => {
    setExtensionBootstrap(null);
  });

  /**
   * Publication is explicit, not inferred: an injected-registry bootstrap can
   * opt in, and a default-configured one can opt out.
   */
  it("honours publish over the injected-registries heuristic", () => {
    const commands = createDesktopCommandRegistry([]);
    const panels = createDesktopPanelRegistry([]);

    const injected = bootstrapExtensions({ commands, panels, extensions: [], publish: true });
    expect(getExtensionBootstrap()).toBe(injected);

    setExtensionBootstrap(null);
    bootstrapExtensions({ extensions: [], publish: false });
    expect(getExtensionBootstrap()).toBeNull();
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
