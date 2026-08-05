import { describe, expect, it } from "vitest";

import {
  createContributionRegistry,
  type CommandContribution,
  type EditorHookContribution,
  type PanelContribution
} from "./contributions";

interface PanelView {
  readonly name: string;
}

interface PanelContext {
  readonly workspaceOpen: boolean;
}

interface EditorPayload {
  readonly language: string;
}

interface EditorContext {
  readonly readOnly: boolean;
}

describe("contribution registry", () => {
  it("registers, looks up, and preserves stable order", () => {
    const first: CommandContribution = {
      id: "notes.create",
      title: "Create note",
      handler: () => undefined
    };
    const second: CommandContribution = {
      id: "notes.open",
      title: "Open note",
      keybinding: "Mod+O",
      handler: () => undefined
    };
    const registry = createContributionRegistry<CommandContribution>([first]);

    registry.register(second);

    expect(registry.get("notes.create")).toBe(first);
    expect(registry.get("missing")).toBeUndefined();
    expect(registry.entries()).toEqual([first, second]);
  });

  it("round-trips the optional keybinding field through the registry", () => {
    const withKeybinding: CommandContribution = {
      id: "cmd.with-keybinding",
      title: "With keybinding",
      keybinding: "Ctrl/Cmd+Shift+F",
      handler: () => undefined
    };
    const withoutKeybinding: CommandContribution = {
      id: "cmd.without-keybinding",
      title: "Without keybinding",
      handler: () => undefined
    };
    const registry = createContributionRegistry<CommandContribution>([
      withKeybinding,
      withoutKeybinding
    ]);

    expect(registry.get("cmd.with-keybinding")?.keybinding).toBe("Ctrl/Cmd+Shift+F");
    expect(registry.get("cmd.without-keybinding")?.keybinding).toBeUndefined();
  });

  it("registers initial contributions in their supplied order", () => {
    const commands: readonly CommandContribution[] = [
      { id: "one", title: "One", handler: () => undefined },
      { id: "two", title: "Two", handler: () => undefined }
    ];

    const registry = createContributionRegistry(commands);

    expect(registry.entries().map((command) => command.id)).toEqual([
      "one",
      "two"
    ]);
  });

  it("executes a typed command handler", async () => {
    const calls: string[] = [];
    const command: CommandContribution<{ readonly name: string }> = {
      id: "notes.rename",
      title: "Rename note",
      handler: async (payload) => {
        calls.push(payload.name);
      }
    };

    await command.handler({ name: "README" });

    expect(calls).toEqual(["README"]);
  });

  it("rejects duplicate identifiers for initial and later registrations", () => {
    const initial: CommandContribution = {
      id: "duplicate",
      title: "Initial",
      handler: () => undefined
    };
    const registry = createContributionRegistry([initial]);

    expect(() =>
      registry.register({
        id: "duplicate",
        title: "Later",
        handler: () => undefined
      })
    ).toThrow('already registered for id "duplicate"');
    expect(() => createContributionRegistry([initial, initial])).toThrow(
      'already registered for id "duplicate"'
    );
  });

  it("returns an idempotent unregister handle and permits re-registration", () => {
    const first: CommandContribution = {
      id: "reusable",
      title: "First",
      handler: () => undefined
    };
    const second: CommandContribution = {
      id: "second",
      title: "Second",
      handler: () => undefined
    };
    const replacement: CommandContribution = {
      id: "reusable",
      title: "Replacement",
      handler: () => undefined
    };
    const registry = createContributionRegistry<CommandContribution>();
    const registration = registry.register(first);
    registry.register(second);

    registration.dispose();
    registration.dispose();
    expect(registry.entries()).toEqual([second]);

    const replacementRegistration = registry.register(replacement);
    expect(registry.entries()).toEqual([second, replacement]);
    replacementRegistration.dispose();
  });

  it("returns a defensive entries snapshot", () => {
    const command: CommandContribution = {
      id: "snapshot",
      title: "Snapshot",
      handler: () => undefined
    };
    const registry = createContributionRegistry([command]);
    const entries = registry.entries();

    (entries as CommandContribution[]).pop();

    expect(registry.entries()).toEqual([command]);
  });
});

describe("typed panel contributions", () => {
  it("supports a generic factory and context-aware availability", () => {
    const panel: PanelContribution<PanelView, PanelContext> = {
      id: "explorer",
      label: "Explorer",
      icon: "files",
      side: "left",
      factory: () => ({ name: "ExplorerView" }),
      availability: (context) => context.workspaceOpen
    };
    const registry = createContributionRegistry<
      PanelContribution<PanelView, PanelContext>
    >([panel]);

    expect(registry.get("explorer")?.availability?.({ workspaceOpen: true })).toBe(
      true
    );
    expect(registry.get("explorer")?.availability?.({ workspaceOpen: false })).toBe(
      false
    );
  });

  it("supports a generic panel factory", () => {
    const panel: PanelContribution<PanelView, PanelContext> = {
      id: "search",
      label: "Search",
      icon: "search",
      side: "right",
      factory: (context) => ({
        name: context.workspaceOpen ? "SearchView" : "UnavailableSearchView"
      })
    };

    expect(panel.factory?.({ workspaceOpen: true })).toEqual({
      name: "SearchView"
    });
  });
});

describe("typed editor hook contributions", () => {
  it("supports ordered extension and keybinding factories", () => {
    const hook: EditorHookContribution<
      { readonly kind: "extension"; readonly language: string },
      { readonly key: string },
      EditorPayload,
      EditorContext
    > = {
      id: "notes.editor",
      order: 20,
      extensions: (payload, context) =>
        context.readOnly
          ? []
          : [{ kind: "extension", language: payload.language }],
      keybindings: (payload) => [{ key: `Mod+${payload.language[0] ?? "N"}` }]
    };
    const registry = createContributionRegistry([hook]);
    const registered = registry.get("notes.editor");

    expect(
      registered?.extensions?.(
        { language: "M" },
        { readOnly: false }
      )
    ).toEqual([{ kind: "extension", language: "M" }]);
    expect(
      registered?.keybindings?.({ language: "M" }, { readOnly: false })
    ).toEqual([{ key: "Mod+M" }]);
    expect(registry.entries().map((entry) => entry.order)).toEqual([20]);
  });
});
