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
  markdownEditorHookRegistry,
  type MarkdownEditorHookPayload
} from "../tabs/markdownEditorHooks";
import type { DesktopEditorHookContribution } from "../tabs/editorHookRegistry";
import {
  appSettingsRegistry,
  useSettingsStore
} from "../settings/settingsStore";

/** A command definition whose identifier is relative to the owning extension. */
export type DesktopExtensionCommand = Omit<DesktopCommand, "id"> & { readonly id: string };

/** A panel definition whose identifier is relative to the owning extension. */
export type DesktopExtensionPanel = Omit<DesktopPanelContribution, "id"> & { readonly id: string };

/** A Markdown editor hook whose identifier is relative to the owning extension. */
export type DesktopExtensionEditorHook = Omit<
  DesktopEditorHookContribution<MarkdownEditorHookPayload, undefined>,
  "id"
> & { readonly id: string };

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
  set(key: string, value: unknown): void;
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

/** The desktop context layered over the platform-neutral core context. */
export interface DesktopExtensionContext extends ExtensionContext {
  readonly commands: DesktopExtensionContributions;
  readonly panels: DesktopExtensionPanelContributions;
  readonly editorHooks: DesktopExtensionEditorHookContributions;
  readonly settings: DesktopExtensionSettings;
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

const LOCAL_KEY_PATTERN = /^[A-Za-z][A-Za-z0-9_-]*(?:\.[A-Za-z][A-Za-z0-9_-]*)*$/;
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

function settingsModuleId(extensionId: string): string {
  return `extension-${extensionId}`;
}

function assertLocalKey(key: string): void {
  if (typeof key !== "string" || !LOCAL_KEY_PATTERN.test(key)) {
    throw new Error(`Setting key "${key}" must be a relative extension-local key.`);
  }
}

function fullSettingKey(extensionId: string, key: string): string {
  assertLocalKey(key);
  const moduleId = settingsModuleId(extensionId);
  const fullKey = `${moduleId}.${key}`;
  if (!appSettingsRegistry.getDefinition(fullKey)) {
    throw new Error(`Setting key "${key}" is not registered by extension "${extensionId}".`);
  }
  return fullKey;
}

const SECTION_ID_PATTERN = /^[A-Za-z][A-Za-z0-9_-]*(?:\.[A-Za-z][A-Za-z0-9_-]*)*$/;

function namespaceSectionId(moduleId: string, sectionId: string): string {
  if (!SECTION_ID_PATTERN.test(sectionId)) {
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

function effectiveValue(
  state: ReturnType<typeof useSettingsStore.getState>,
  definition: SettingDefinition | undefined,
  key: string
): unknown {
  if (key in state.stagedChanges) return state.stagedChanges[key];
  if (definition?.scope === "workspace") {
    if (state.workspaceValues && key in state.workspaceValues) return state.workspaceValues[key];
  } else if (key in state.appValues) {
    return state.appValues[key];
  }
  return definition?.default;
}

function own(context: ExtensionContext, disposable: Disposable, assertActive: () => void): Disposable {
  assertActive();
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
}

const defaultRegistries = (): DesktopExtensionHostRegistries => ({
  commands: desktopCommandRegistry,
  panels: desktopPanelRegistry,
  editorHooks: markdownEditorHookRegistry
});

/** Creates a scoped desktop context for one host-controlled lifecycle. */
function createDesktopExtensionContext(
  context: ExtensionContext,
  isActive: () => boolean,
  registries: DesktopExtensionHostRegistries
): DesktopExtensionContext {
  const moduleId = settingsModuleId(context.extensionId);
  const assertActive = (): void => {
    if (!isActive()) {
      throw new Error(`Extension "${context.extensionId}" is no longer active.`);
    }
  };
  const settings: DesktopExtensionSettings = {
    registerSchema: (schema) => {
      assertActive();
      const registration = appSettingsRegistry.register(namespaceSchema(moduleId, schema));
      return own(context, registration, assertActive);
    },
    get: <T>(key: string): T | undefined => {
      assertActive();
      const fullKey = fullSettingKey(context.extensionId, key);
      const state = useSettingsStore.getState();
      return effectiveValue(state, appSettingsRegistry.getDefinition(fullKey), fullKey) as T | undefined;
    },
    set: (key, value) => {
      assertActive();
      const fullKey = fullSettingKey(context.extensionId, key);
      useSettingsStore.getState().stageChange(fullKey, value);
    },
    onDidChange: (key, listener) => {
      assertActive();
      const fullKey = fullSettingKey(context.extensionId, key);
      const definition = appSettingsRegistry.getDefinition(fullKey);
      let previous = effectiveValue(useSettingsStore.getState(), definition, fullKey);
      const subscription = useSettingsStore.subscribe((state) => {
        const next = effectiveValue(state, definition, fullKey);
        if (Object.is(next, previous)) return;
        const old = previous;
        previous = next;
        listener(next, old);
      });
      return own(context, { dispose: subscription }, assertActive);
    }
  };

  return {
    extensionId: context.extensionId,
    subscriptions: context.subscriptions,
    commands: {
      register: (command) => {
        assertActive();
        return own(context, registries.commands.register({
          ...command,
          id: prefixId(context.extensionId, "Command", command.id)
        }), assertActive);
      }
    },
    panels: {
      register: (panel) => {
        assertActive();
        return own(context, registries.panels.register({
          ...panel,
          id: prefixId(context.extensionId, "Panel", panel.id)
        }), assertActive);
      }
    },
    editorHooks: {
      register: (hook) => {
        assertActive();
        return own(context, registries.editorHooks.register({
          ...hook,
          id: prefixId(context.extensionId, "Editor hook", hook.id)
        }), assertActive);
      }
    },
    settings
  };
}

/** Creates a trusted same-context desktop extension host. */
export function createDesktopExtensionHost(
  registries: Partial<DesktopExtensionHostRegistries> = {}
): DesktopExtensionHost {
  const coreHost = createExtensionHost();
  const resolved: DesktopExtensionHostRegistries = { ...defaultRegistries(), ...registries };

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