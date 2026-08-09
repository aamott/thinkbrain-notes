import { afterEach, describe, expect, it } from "vitest";
import {
  ExtensionActivationError,
  InvalidExtensionIdError,
  type Disposable
} from "@thinkbrain/core";

import {
  appSettingsRegistry,
  useSettingsStore
} from "../settings/settingsStore";
import { appEvents } from "../events/appEvents";
import { desktopCommandRegistry } from "../commands/commandRegistry";
import { createDesktopTabRegistry } from "../tabs/tabRegistry";
import { setWorkspaceBridge } from "./workspaceBridge";
import { desktopPanelRegistry } from "../panels/panelRegistry";
import { markdownEditorHookRegistry } from "../tabs/markdownEditorHooks";
import { createDesktopEditorHeaderRegistry } from "../tabs/editorHeaderRegistry.ts";
import {
  createDesktopExtensionHost,
  type DesktopExtensionContext,
  type DesktopExtensionDefinition
} from "./desktopExtensionHost";

const schema = {
  label: "Test extension",
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
    }, {
      key: "nested.value",
      type: "number" as const,
      label: "Nested value",
      description: "A nested test setting.",
      default: 1,
      scope: "app" as const,
      section: "section"
    }]
  }]
};

function definition(
  id: string,
  activate: DesktopExtensionDefinition["activate"],
  deactivate?: DesktopExtensionDefinition["deactivate"]
): DesktopExtensionDefinition {
  return { id, trusted: true, activate, deactivate };
}

describe("desktop extension host", () => {
  it("prefixes relative contribution IDs, inserts live, and rejects collisions", async () => {
    const host = createDesktopExtensionHost();
    let context: DesktopExtensionContext | undefined;
    host.register(definition("calendar", (activationContext) => {
      context = activationContext;
      activationContext.commands.register({
        id: "open",
        title: "Open calendar",
        availability: "available",
        handler: () => undefined
      });
      activationContext.panels.register({
        id: "calendar",
        label: "Calendar",
        icon: "calendar",
        side: "left",
        factory: () => "calendar"
      });
      activationContext.editorHooks.register({
        id: "completion",
        order: 10,
        keybindings: () => []
      });
    }));

    await host.activate("calendar");

    expect(context?.extensionId).toBe("calendar");
    expect(desktopCommandRegistry.get("calendar.open")?.title).toBe("Open calendar");
    expect(desktopPanelRegistry.get("calendar.calendar")?.label).toBe("Calendar");
    expect(markdownEditorHookRegistry.get("calendar.completion")).toBeDefined();
    expect(() => context?.commands.register({
      id: "open",
      title: "Collision",
      availability: "available",
      handler: () => undefined
    })).toThrow('already registered for id "calendar.open"');

    await host.deactivate("calendar");
    expect(desktopCommandRegistry.get("calendar.open")).toBeUndefined();
    expect(desktopPanelRegistry.get("calendar.calendar")).toBeUndefined();
    expect(markdownEditorHookRegistry.get("calendar.completion")).toBeUndefined();
  });

  it("accepts canonical IDs and rejects dotted, uppercase, underscore, and malformed IDs", () => {
    const host = createDesktopExtensionHost();
    for (const id of ["foo.bar", "Foo", "foo_bar", "1foo", "foo-"]) {
      expect(() => host.register(definition(id, () => undefined)))
        .toThrow(InvalidExtensionIdError);
    }

    const registration = host.register(definition("foo-bar2", () => undefined));
    expect(host.status("foo-bar2")).toBe("registered");
    registration.dispose();
  });

  it("derives settings namespaces directly from canonical IDs", async () => {
    const host = createDesktopExtensionHost();
    host.register(definition("foo-bar", (context) => context.settings.registerSchema(schema)));

    await host.activate("foo-bar");

    expect(appSettingsRegistry.getModule("extension-foo-bar")).toBeDefined();
    await host.dispose();
    expect(appSettingsRegistry.getModule("extension-foo-bar")).toBeUndefined();
  });

  it("cleans registrations when activation fails", async () => {
    const host = createDesktopExtensionHost();
    host.register(definition("broken", (context) => {
      context.commands.register({
        id: "command",
        title: "Command",
        availability: "available",
        handler: () => undefined
      });
      context.settings.registerSchema(schema);
      throw new Error("broken activation");
    }));

    await expect(host.activate("broken")).rejects.toBeInstanceOf(ExtensionActivationError);
    expect(desktopCommandRegistry.get("broken.command")).toBeUndefined();
    expect(appSettingsRegistry.getModule("extension-broken")).toBeUndefined();
  });

  it("scopes settings reads, staged writes, and change events", async () => {
    useSettingsStore.setState({
      appValues: {},
      workspaceValues: null,
      stagedChanges: {},
      isDirty: false,
      dirtyCount: 0
    });
    const host = createDesktopExtensionHost();
    let context: DesktopExtensionContext | undefined;
    host.register(definition("test-extension", (activationContext) => {
      context = activationContext;
      activationContext.settings.registerSchema(schema);
      expect(() => activationContext.settings.registerSchema(schema)).toThrow("already registered");
    }));
    await host.activate("test-extension");

    const changes: Array<[unknown, unknown]> = [];
    const subscription = context?.settings.onDidChange("enabled", (value, previous) => {
      changes.push([value, previous]);
    });
    expect(subscription).toBeDefined();
    expect(context?.settings.get<boolean>("enabled")).toBe(false);
    expect(appSettingsRegistry.getDefinition("extension-test-extension.enabled")?.section)
      .toBe("extension-test-extension.section");
    expect(appSettingsRegistry.getDefinition("extension-test-extension.nested.value")?.section)
      .toBe("extension-test-extension.section");

    // Where the value lands is D81's business, covered in
    // `desktopExtensionHostSettings.test.ts`; here it only has to be readable.
    await context?.settings.set("enabled", true);
    await context?.settings.set("nested.value", 2);
    expect(context?.settings.get<boolean>("enabled")).toBe(true);
    expect(context?.settings.get<number>("nested.value")).toBe(2);
    expect(changes).toEqual([[true, false]]);
    expect(() => context?.settings.get("appearance.theme")).toThrow();
    expect(() => context?.settings.set("appearance.theme", "dark")).toThrow();

    await host.deactivate("test-extension");
    expect(() => context?.settings.set("enabled", false)).toThrow("no longer active");
    expect(() => context?.settings.get("enabled")).toThrow("no longer active");
    expect(() => context?.settings.onDidChange("enabled", () => undefined)).toThrow("no longer active");
    useSettingsStore.getState().stageChange("extension-test-extension.enabled", false);
    expect(changes).toEqual([[true, false]]);
    expect(appSettingsRegistry.getModule("extension-test-extension")).toBeUndefined();
  });

  it("adds returned activation disposables to the core subscription store", async () => {
    let disposed = 0;
    const returned: Disposable = { dispose: () => { disposed += 1; } };
    const host = createDesktopExtensionHost();
    host.register(definition("returned", () => returned));

    await host.activate("returned");
    await host.deactivate("returned");
    expect(disposed).toBe(1);

  });
});

describe("app events", () => {
  it("delivers app events to an active extension and stops after deactivate", async () => {
    const received: unknown[] = [];
    const host = createDesktopExtensionHost();
    host.register(definition("listener", (context) => {
      context.events.on("note.saved", (event) => received.push(event));
    }));
    await host.activate("listener");

    appEvents.emit("note.saved", { rootPath: "/vault", relativePath: "a.md" });
    expect(received).toEqual([{ rootPath: "/vault", relativePath: "a.md" }]);

    await host.deactivate("listener");
    appEvents.emit("note.saved", { rootPath: "/vault", relativePath: "b.md" });
    expect(received).toHaveLength(1);
  });

  it("rejects a subscription after the extension deactivates", async () => {
    let context: DesktopExtensionContext | undefined;
    const host = createDesktopExtensionHost();
    host.register(definition("late", (received) => {
      context = received;
    }));
    await host.activate("late");
    await host.deactivate("late");

    expect(() => context?.events.on("note.saved", () => undefined)).toThrow("no longer active");
  });
});

describe("workspace and tab contributions", () => {
  it("exposes the workspace notes API to an activated extension", async () => {
    let context: DesktopExtensionContext | undefined;
    const host = createDesktopExtensionHost();
    host.register(definition("workspace-user", (received) => {
      context = received;
    }));

    await host.activate("workspace-user");

    expect(typeof context?.workspace.readNote).toBe("function");
    expect(typeof context?.workspace.createNote).toBe("function");
    expect(typeof context?.workspace.openNote).toBe("function");
    expect(context?.workspace.rootPath()).toBeNull();
  });

  it("registers a contributed tab under a prefixed kind and disposes it", async () => {
    const tabs = createDesktopTabRegistry([]);
    const host = createDesktopExtensionHost({ tabs });
    host.register(definition("calendars", (context) => {
      context.tabs.register({
        kind: "calendar",
        label: "Calendar",
        isAvailable: true,
        availability: "available",
        factory: () => null
      });
    }));

    await host.activate("calendars");
    expect(tabs.get("calendars.calendar")?.label).toBe("Calendar");

    await host.deactivate("calendars");
    expect(tabs.get("calendars.calendar")).toBeUndefined();
  });

  it("rejects a tab kind that is not a relative kebab-case id", async () => {
    const tabs = createDesktopTabRegistry([]);
    const host = createDesktopExtensionHost({ tabs });
    host.register(definition("calendars", (context) => {
      context.tabs.register({
        kind: "Calendar View",
        label: "Calendar",
        isAvailable: true,
        availability: "available"
      });
    }));

    // Activation wraps the cause, so the useful message is on `cause`.
    const error = await host.activate("calendars").catch((thrown: unknown) => thrown);

    expect((error as { cause?: Error }).cause?.message).toMatch(/kebab-case/i);
    expect(tabs.get("calendars.Calendar View")).toBeUndefined();
  });

  it("opens a tab of a kind the extension registered", async () => {
    const tabs = createDesktopTabRegistry([]);
    const opened: [string, string][] = [];
    setWorkspaceBridge({
      rootPath: "/vault",
      openNote: () => undefined,
      openTab: (kind, title) => opened.push([kind, title])
    });
    const host = createDesktopExtensionHost({ tabs });
    host.register(definition("calendars", (context) => {
      context.tabs.register({
        kind: "calendar",
        label: "Calendar",
        isAvailable: true,
        availability: "available",
        factory: () => null
      });
      context.tabs.open("calendar", "August 2026");
    }));

    await host.activate("calendars");

    // The kind is host-prefixed, so the shell opens the registered kind.
    expect(opened).toEqual([["calendars.calendar", "August 2026"]]);
    setWorkspaceBridge(null);
  });

  it("refuses to open a tab kind the extension did not register", async () => {
    const tabs = createDesktopTabRegistry([]);
    setWorkspaceBridge({
      rootPath: "/vault",
      openNote: () => undefined,
      openTab: () => undefined
    });
    const host = createDesktopExtensionHost({ tabs });
    host.register(definition("calendars", (context) => {
      context.tabs.open("calendar", "August 2026");
    }));

    const error = await host.activate("calendars").catch((thrown: unknown) => thrown);

    expect((error as { cause?: Error }).cause?.message).toMatch(/did not register/i);
    setWorkspaceBridge(null);
  });

  it("stops opening tabs once the extension deactivates", async () => {
    const tabs = createDesktopTabRegistry([]);
    setWorkspaceBridge({
      rootPath: "/vault",
      openNote: () => undefined,
      openTab: () => undefined
    });
    let captured: DesktopExtensionContext | undefined;
    const host = createDesktopExtensionHost({ tabs });
    host.register(definition("calendars", (context) => {
      captured = context;
      context.tabs.register({
        kind: "calendar",
        label: "Calendar",
        isAvailable: true,
        availability: "available",
        factory: () => null
      });
    }));

    await host.activate("calendars");
    await host.deactivate("calendars");

    expect(() => captured?.tabs.open("calendar", "August 2026")).toThrow(/no longer active/i);
    setWorkspaceBridge(null);
  });
});

describe("editor header contributions", () => {
  const dateline = {
    id: "metadata-widget",
    label: "Entry metadata",
    render: () => null
  };

  it("registers an editor header under a prefixed id and disposes it", async () => {
    const editorHeaders = createDesktopEditorHeaderRegistry();
    const host = createDesktopExtensionHost({ editorHeaders });
    host.register(definition("journal-calendar", (context) => {
      context.editorHeaders.register(dateline);
    }));

    await host.activate("journal-calendar");
    expect(editorHeaders.get("journal-calendar.metadata-widget")?.label).toBe(
      "Entry metadata"
    );

    await host.deactivate("journal-calendar");
    expect(editorHeaders.get("journal-calendar.metadata-widget")).toBeUndefined();
  });

  it("rejects a header id that is not a relative kebab-case id", async () => {
    const editorHeaders = createDesktopEditorHeaderRegistry();
    const host = createDesktopExtensionHost({ editorHeaders });
    host.register(definition("journal-calendar", (context) => {
      context.editorHeaders.register({ ...dateline, id: "Metadata Widget" });
    }));

    await expect(host.activate("journal-calendar")).rejects.toThrow();
    expect(editorHeaders.entries()).toEqual([]);
  });

  it("refuses to register once the extension is no longer active", async () => {
    const editorHeaders = createDesktopEditorHeaderRegistry();
    const host = createDesktopExtensionHost({ editorHeaders });
    let captured: DesktopExtensionContext | undefined;
    host.register(definition("journal-calendar", (context) => {
      captured = context;
    }));

    await host.activate("journal-calendar");
    await host.deactivate("journal-calendar");

    expect(() => captured?.editorHeaders.register(dateline)).toThrow();
  });
});

/** D45: an extension reads and observes values for the workspace that is open. */
describe("workspace-scoped extension settings", () => {
  const scopedSchema = {
    label: "Journal",
    scope: "app" as const,
    sections: [
      {
        id: "main",
        label: "Main",
        settings: [
          {
            key: "root",
            type: "path" as const,
            label: "Folder",
            description: "Per workspace.",
            default: "journal",
            scope: "workspace" as const,
            section: "main"
          }
        ]
      }
    ]
  };

  // The settings registry is app-wide, so each test has to hand its module back
  // or the next activation collides on the same namespace.
  let host: ReturnType<typeof createDesktopExtensionHost> | null = null;

  afterEach(async () => {
    await host?.dispose();
    host = null;
  });

  const activate = async (): Promise<DesktopExtensionContext> => {
    host = createDesktopExtensionHost();
    let context: DesktopExtensionContext | undefined;
    host.register(definition("journal-calendar", (received) => {
      context = received;
      received.settings.registerSchema(scopedSchema);
    }));
    await host.activate("journal-calendar");
    if (!context) throw new Error("activation did not run");
    return context;
  };

  const KEY = "extension-journal-calendar.root";

  it("reads the override for the workspace that is open", async () => {
    const context = await activate();
    useSettingsStore.setState({
      appValues: {},
      workspaceValues: { [KEY]: "diary" },
      workspaceRootPath: "/notes/work",
      stagedChanges: {}
    });

    expect(context.settings.get<string>("root")).toBe("diary");
  });

  it("falls back to the default when no workspace is open", async () => {
    const context = await activate();
    useSettingsStore.setState({
      appValues: {},
      workspaceValues: null,
      workspaceRootPath: null,
      stagedChanges: {}
    });

    expect(context.settings.get<string>("root")).toBe("journal");
  });

  it("notifies a subscriber when the active workspace changes", async () => {
    // An open journal panel has to follow the user into the next vault.
    const context = await activate();
    useSettingsStore.setState({
      appValues: {},
      workspaceValues: { [KEY]: "diary" },
      workspaceRootPath: "/notes/work",
      stagedChanges: {}
    });
    const seen: unknown[] = [];
    context.settings.onDidChange("root", (value) => seen.push(value));

    useSettingsStore.setState({
      workspaceValues: { [KEY]: "personal" },
      workspaceRootPath: "/notes/home"
    });

    expect(seen).toEqual(["personal"]);
  });
});
