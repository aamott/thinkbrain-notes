import { describe, expect, it } from "vitest";
import {
  ExtensionActivationError,
  InvalidExtensionIdError,
  type Disposable
} from "@thinkbrain/core";

import {
  appSettingsRegistry,
  useSettingsStore
} from "../settings/settingsStore";
import { desktopCommandRegistry } from "../commands/commandRegistry";
import { desktopPanelRegistry } from "../panels/panelRegistry";
import { markdownEditorHookRegistry } from "../tabs/markdownEditorHooks";
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

    context?.settings.set("enabled", true);
    context?.settings.set("nested.value", 2);
    expect(useSettingsStore.getState().stagedChanges).toEqual({
      "extension-test-extension.enabled": true,
      "extension-test-extension.nested.value": 2
    });
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
