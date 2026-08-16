import {
  createExtensionHost,
  type Disposable,
  type ExtensionContext,
  type ExtensionDefinition,
  type ExtensionHost,
  type ExtensionStatus,
  type ExtensionStatusEntry,
  type SettingDefinition,
  type SettingSection,
  type SettingsModule
} from "@thinkbrain/core";
import {
  desktopCommandRegistry,
  type DesktopCommand
} from "../commands/commandRegistry";
import {
  desktopPanelRegistry,
  type DesktopPanelContribution
} from "../panels/panelRegistry";
import {
  createExtensionPanelMountFactory,
  type ExtensionPanelMount
} from "../panels/extensionPanelMount";
import {
  markdownEditorHookRegistry,
  type MarkdownEditorHookPayload
} from "../tabs/markdownEditorHooks";
import {
  desktopEditorHeaderRegistry,
  type DesktopEditorHeaderContribution
} from "../tabs/editorHeaderRegistry.ts";
import { desktopTabRegistry, type DesktopTabView } from "../tabs/tabRegistry";
import { appEvents, type AppEvents } from "../events/appEvents";
import { workspaceDesktopApi } from "../workspace/workspaceAdapter";
import { workspaceDocumentApi } from "../workspace/workspaceDocumentAdapter";
import { createExtensionWorkspace, type DesktopExtensionWorkspace } from "./extensionWorkspace";
import { getWorkspaceBridge } from "./workspaceBridge";
import type { DesktopEditorHookContribution } from "../tabs/editorHookRegistry";
import {
  appSettingsRegistry,
  useSettingsStore
} from "../settings/settingsStore";
import { effectiveSettingValue } from "../settings/settingsHelpers";

/** A command definition whose identifier is relative to the owning extension. */
export type DesktopExtensionCommand = Omit<DesktopCommand, "id"> & { readonly id: string };

/**
 * A panel definition whose identifier is relative to the owning extension.
 *
 * Two forms, because two kinds of extension exist. A built-in shares the app's
 * React instance and contributes a `factory`. An extension loaded from disk is
 * a pre-bundled module with no access to that instance, so it contributes a
 * framework-neutral `mount` and owns the DOM inside the element it is given.
 */
export type DesktopExtensionPanel =
  | (Omit<DesktopPanelContribution, "id"> & {
      readonly id: string;
      readonly mount?: undefined;
    })
  | (Omit<DesktopPanelContribution, "id" | "factory"> & {
      readonly id: string;
      readonly mount: ExtensionPanelMount;
      readonly factory?: undefined;
    });

/** A Markdown editor hook whose identifier is relative to the owning extension. */
export type DesktopExtensionEditorHook = Omit<
  DesktopEditorHookContribution<MarkdownEditorHookPayload, undefined>,
  "id"
> & { readonly id: string };

/** A tab view whose kind is relative to the owning extension. */
export type DesktopExtensionTab = Omit<DesktopTabView, "kind"> & { readonly kind: string };

/** An extension schema receives its own module and section namespaces automatically. */
export type DesktopExtensionSettingsSchema = Omit<SettingsModule, "id">;

export type DesktopSettingChangeListener = (
  value: unknown,
  previousValue: unknown
) => void;

/** The settings surface exposed to one desktop extension. */
export interface DesktopExtensionSettings {
  registerSchema(schema: DesktopExtensionSettingsSchema): Disposable;
  get<T = unknown>(key: string): T | undefined;
  /**
   * Writes and persists a setting (D81).
   *
   * Rejects nothing: a failed write is logged and the value stays effective for
   * the session. Awaiting is optional — the key is validated before returning.
   */
  set(key: string, value: unknown): Promise<void>;
  onDidChange(key: string, listener: DesktopSettingChangeListener): Disposable;
}

/** Scoped contribution registration APIs exposed to one desktop extension. */
export interface DesktopExtensionContributions {
  register(command: DesktopExtensionCommand): Disposable;
}

export interface DesktopExtensionPanelContributions {
  register(panel: DesktopExtensionPanel): Disposable;
}

export interface DesktopExtensionEditorHookContributions {
  register(hook: DesktopExtensionEditorHook): Disposable;
}

/**
 * Editor-header contributions (D44).
 *
 * Separate from `editorHooks`, which stays limited to CodeMirror extensions and
 * keybindings: a header is a React surface, and overloading one surface with
 * both would tie a component's lifetime to CodeMirror's.
 */
export interface DesktopExtensionEditorHeaderContributions {
  register(header: DesktopExtensionEditorHeader): Disposable;
}

export type DesktopExtensionEditorHeader = Omit<
  DesktopEditorHeaderContribution,
  "id"
> & { readonly id: string };

export interface DesktopExtensionTabContributions {
  register(tab: DesktopExtensionTab): Disposable;
  /**
   * Opens a tab of a kind this extension registered.
   *
   * Scoped deliberately: an extension opens its own views, not another's. The
   * shell's internal `openTab` stays internal.
   */
  open(kind: string, title: string): void;
}

/** App-event subscriptions scoped to one extension's activation. */
export interface DesktopExtensionEvents {
  /** Subscribes until disposed or the extension deactivates. */
  on<Name extends keyof AppEvents & string>(
    event: Name,
    listener: (payload: AppEvents[Name]) => void
  ): Disposable;
}

/** The desktop context layered over the platform-neutral core context. */
export interface DesktopExtensionContext extends ExtensionContext {
  readonly commands: DesktopExtensionContributions;
  readonly panels: DesktopExtensionPanelContributions;
  readonly editorHooks: DesktopExtensionEditorHookContributions;
  readonly editorHeaders: DesktopExtensionEditorHeaderContributions;
  readonly tabs: DesktopExtensionTabContributions;
  readonly settings: DesktopExtensionSettings;
  /** Notifies about app events such as notes being saved or created. */
  readonly events: DesktopExtensionEvents;
  /** Reads, writes, creates, and opens notes in the current workspace. */
  readonly workspace: DesktopExtensionWorkspace;
}

export type DesktopExtensionActivation = (
  context: DesktopExtensionContext
) => void | Disposable | readonly Disposable[] | Promise<void | Disposable | readonly Disposable[]>;

export interface DesktopExtensionDefinition
  extends Omit<ExtensionDefinition, "activate" | "deactivate"> {
  readonly activate: DesktopExtensionActivation;
  readonly deactivate?: (context: DesktopExtensionContext) => void | Promise<void>;
}

export interface DesktopExtensionHost extends Omit<ExtensionHost, "register"> {
  register(extension: DesktopExtensionDefinition): Disposable;
  registerAndActivate(extension: DesktopExtensionDefinition): Promise<Disposable>;
}

const DOTTED_IDENTIFIER_PATTERN = /^[A-Za-z][A-Za-z0-9_-]*(?:\.[A-Za-z][A-Za-z0-9_-]*)*$/;
const RELATIVE_ID_PATTERN = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;

function assertRelativeId(kind: string, id: string): void {
  if (typeof id !== "string" || !RELATIVE_ID_PATTERN.test(id)) {
    throw new Error(
      `${kind} id "${id}" must be a lowercase kebab-case relative identifier.`
    );
  }
}

function prefixId(extensionId: string, kind: string, id: string): string {
  assertRelativeId(kind, id);
  return `${extensionId}.${id}`;
}

/** Resolves either panel form to the single contribution shape the registry stores. */
function toPanelContribution(
  extensionId: string,
  panel: DesktopExtensionPanel
): DesktopPanelContribution {
  const relativeId = panel.id;
  const id = prefixId(extensionId, "Panel", relativeId);
  if (panel.mount) {
    const { mount, ...rest } = panel;
    return { ...rest, id, factory: createExtensionPanelMountFactory(mount) };
  }
  // Defensive rather than redundant: an extension loaded from disk is plain
  // JavaScript, so the union above constrains built-ins only.
  if (!panel.factory) {
    throw new Error(`Panel "${relativeId}" must declare a factory or a mount function.`);
  }
  return { ...panel, id };
}

function settingsModuleId(extensionId: string): string {
  return `extension-${extensionId}`;
}

function assertLocalKey(key: string): void {
  if (typeof key !== "string" || !DOTTED_IDENTIFIER_PATTERN.test(key)) {
    throw new Error(`Setting key "${key}" must be a relative extension-local key.`);
  }
}

function fullSettingKey(extensionId: string, key: string): { fullKey: string; definition: SettingDefinition } {
  assertLocalKey(key);
  const moduleId = settingsModuleId(extensionId);
  const fullKey = `${moduleId}.${key}`;
  const definition = appSettingsRegistry.getDefinition(fullKey);
  if (!definition) {
    throw new Error(`Setting key "${key}" is not registered by extension "${extensionId}".`);
  }
  return { fullKey, definition };
}

function namespaceSectionId(moduleId: string, sectionId: string): string {
  if (!DOTTED_IDENTIFIER_PATTERN.test(sectionId)) {
    throw new Error(`Setting section id "${sectionId}" must be a dotted identifier.`);
  }
  return sectionId === moduleId || sectionId.startsWith(`${moduleId}.`)
    ? sectionId
    : `${moduleId}.${sectionId}`;
}

function namespaceSection(moduleId: string, section: SettingSection): SettingSection {
  return {
    ...section,
    id: namespaceSectionId(moduleId, section.id),
    settings: section.settings?.map((definition) => ({
      ...definition,
      section: namespaceSectionId(moduleId, definition.section)
    })),
    subsections: section.subsections?.map((subsection) =>
      namespaceSection(moduleId, subsection)
    )
  };
}

function namespaceSchema(moduleId: string, schema: DesktopExtensionSettingsSchema): SettingsModule {
  return {
    ...schema,
    id: moduleId,
    sections: schema.sections.map((section) => namespaceSection(moduleId, section))
  };
}

/** Adds a disposable to the activation scope. Callers must have already called `assertActive`. */
function own(context: ExtensionContext, disposable: Disposable): Disposable {
  return context.subscriptions.add(disposable);
}

/**
 * Registries an extension host writes into.
 *
 * Injectable so tests can isolate a host from the app-wide singletons; two
 * hosts sharing the module singletons would collide on contribution ids.
 */
export interface DesktopExtensionHostRegistries {
  readonly commands: typeof desktopCommandRegistry;
  readonly panels: typeof desktopPanelRegistry;
  readonly editorHooks: typeof markdownEditorHookRegistry;
  readonly editorHeaders: typeof desktopEditorHeaderRegistry;
  readonly tabs: typeof desktopTabRegistry;
}

/**
 * One workspace surface shared by every extension.
 *
 * Stateless: it reads the shell's published bridge on each call, so it stays
 * correct across workspace switches and shell remounts.
 */
const extensionWorkspace = createExtensionWorkspace({
  documents: workspaceDocumentApi,
  getBridge: getWorkspaceBridge,
  entries: workspaceDesktopApi
});

/** Creates a scoped desktop context for one host-controlled lifecycle. */
function createDesktopExtensionContext(
  context: ExtensionContext,
  isActive: () => boolean,
  registries: DesktopExtensionHostRegistries
): DesktopExtensionContext {
  const moduleId = settingsModuleId(context.extensionId);
  /** Tab kinds this activation registered, so `open` cannot reach another's. */
  const ownKinds = new Set<string>();
  const assertActive = (): void => {
    if (!isActive()) {
      throw new Error(`Extension "${context.extensionId}" is no longer active.`);
    }
  };
  const settings: DesktopExtensionSettings = {
    registerSchema: (schema) => {
      assertActive();
      const registration = appSettingsRegistry.register(namespaceSchema(moduleId, schema));
      return own(context, registration);
    },
    get: <T>(key: string): T | undefined => {
      assertActive();
      const { fullKey, definition } = fullSettingKey(context.extensionId, key);
      const state = useSettingsStore.getState();
      return effectiveSettingValue(state, definition, fullKey) as T | undefined;
    },
    set: (key, value) => {
      // Validates synchronously and persists asynchronously (D81): a foreign key
      // is a programming error and must fail even for a caller that never
      // awaits, while the write itself has no Save bar to wait for.
      assertActive();
      const { fullKey } = fullSettingKey(context.extensionId, key);
      return useSettingsStore.getState().setSettingImmediately(fullKey, value);
    },
    onDidChange: (key, listener) => {
      assertActive();
      const { fullKey, definition } = fullSettingKey(context.extensionId, key);
      let previous = effectiveSettingValue(useSettingsStore.getState(), definition, fullKey);
      const subscription = useSettingsStore.subscribe((state) => {
        const next = effectiveSettingValue(state, definition, fullKey);
        if (Object.is(next, previous)) return;
        const old = previous;
        previous = next;
        listener(next, old);
      });
      return own(context, { dispose: subscription });
    }
  };

  const registerPrefixed = <T extends { readonly id: string }>(
    registry: { register(item: T): Disposable },
    kind: string
  ): ((item: T) => Disposable) => (item) => {
    assertActive();
    return own(context, registry.register({
      ...item,
      id: prefixId(context.extensionId, kind, item.id)
    }));
  };

  return {
    extensionId: context.extensionId,
    subscriptions: context.subscriptions,
    commands: { register: registerPrefixed(registries.commands, "Command") },
    panels: {
      register: (panel) => {
        assertActive();
        return own(context, registries.panels.register(toPanelContribution(context.extensionId, panel)));
      }
    },
    editorHooks: { register: registerPrefixed(registries.editorHooks, "Editor hook") },
    editorHeaders: { register: registerPrefixed(registries.editorHeaders, "Editor header") },
    tabs: {
      register: (tab) => {
        assertActive();
        const kind = prefixId(context.extensionId, "Tab", tab.kind);
        ownKinds.add(kind);
        return own(context, registries.tabs.register({ ...tab, kind }));
      },
      open: (kind, title) => {
        assertActive();
        const fullKind = prefixId(context.extensionId, "Tab", kind);
        if (!ownKinds.has(fullKind)) {
          throw new Error(
            `Extension "${context.extensionId}" did not register a tab kind "${kind}".`
          );
        }
        const bridge = getWorkspaceBridge();
        if (!bridge) throw new Error("The workspace is not ready yet.");
        bridge.openTab(fullKind, title);
      }
    },
    events: {
      on: (event, listener) => {
        assertActive();
        return own(context, appEvents.on(event, listener));
      }
    },
    workspace: extensionWorkspace,
    settings
  };
}

/** Creates a trusted same-context desktop extension host. */
export function createDesktopExtensionHost(
  registries: Partial<DesktopExtensionHostRegistries> = {}
): DesktopExtensionHost {
  const coreHost = createExtensionHost();
  const resolved: DesktopExtensionHostRegistries = {
    commands: desktopCommandRegistry,
    panels: desktopPanelRegistry,
    editorHooks: markdownEditorHookRegistry,
    editorHeaders: desktopEditorHeaderRegistry,
    tabs: desktopTabRegistry,
    ...registries
  };

  const register = (extension: DesktopExtensionDefinition): Disposable => {
    let active = false;
    const coreDefinition: ExtensionDefinition = {
      ...extension,
      activate: async (context) => {
        active = true;
        try {
          return await extension.activate(createDesktopExtensionContext(context, () => active, resolved));
        } catch (error: unknown) {
          active = false;
          throw error;
        }
      },
      deactivate: async (context) => {
        try {
          if (extension.deactivate) {
            await extension.deactivate(createDesktopExtensionContext(context, () => active, resolved));
          }
        } finally {
          active = false;
        }
      }
    };
    return coreHost.register(coreDefinition);
  };

  const registerAndActivate = async (
    extension: DesktopExtensionDefinition
  ): Promise<Disposable> => {
    const registration = register(extension);
    try {
      await coreHost.activate(extension.id);
      return registration;
    } catch (error: unknown) {
      try {
        await registration.dispose();
      } catch {
        // The activation error is the useful failure; core activation already
        // reports any cleanup failure on its typed error object.
      }
      throw error;
    }
  };

  return {
    register,
    registerAndActivate,
    activate: coreHost.activate,
    deactivate: coreHost.deactivate,
    status: (id: string): ExtensionStatus | undefined => coreHost.status(id),
    statuses: (): readonly ExtensionStatusEntry[] => coreHost.statuses(),
    dispose: coreHost.dispose
  };
}

/** Shared lifecycle surface for desktop bootstrap and future first-party built-ins. */
export const desktopExtensionHost = createDesktopExtensionHost();