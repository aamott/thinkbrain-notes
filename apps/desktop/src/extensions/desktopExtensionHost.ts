import {
  createExtensionHost,
  EXTENSION_ID_PATTERN,
  type Disposable,
  type EventSubscriber,
  type ExtensionContext,
  type ExtensionDefinition,
  type ExtensionHost,
  type SettingDefinition,
  type SettingSection,
  type SettingsModule,
  type SettingsRegistry
} from "@thinkbrain/core";
import {
  desktopCommandRegistry,
  type DesktopCommand
} from "../commands/commandRegistry";
import {
  desktopPanelRegistry,
  type DesktopPanelContribution
} from "../panels/panelRegistryModel";
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
import { getWorkspaceBridge, subscribeWorkspaceBridge } from "./workspaceBridge";
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
   * Persists only this key: unrelated staged edits are not flushed, and a
   * staged value that would fail validation cannot strand this write. Rejects
   * nothing: a failed write is logged and the value stays effective for the
   * session. Awaiting is optional — the key is validated before returning.
   */
  set(key: string, value: unknown): Promise<void>;
  onDidChange(key: string, listener: DesktopSettingChangeListener): Disposable;
}

/** Scoped contribution registration API exposed to one desktop extension. */
export interface Registrar<T> {
  register(item: T): Disposable;
}

export type DesktopExtensionEditorHeader = Omit<
  DesktopEditorHeaderContribution,
  "id"
> & { readonly id: string };

export interface DesktopExtensionTabContributions extends Registrar<DesktopExtensionTab> {
  /**
   * Opens a tab of a kind this extension registered.
   *
   * Scoped deliberately: an extension opens its own views, not another's. The
   * shell's internal `openTab` stays internal.
   */
  open(kind: string, title: string): void;
}

/**
 * App-event subscriptions scoped to one extension's activation.
 *
 * The shape is `EventSubscriber` verbatim; the scoping lives in the host,
 * which owns each returned disposable in the activation's subscription store,
 * so deactivation removes the listener.
 */
export type DesktopExtensionEvents = EventSubscriber<AppEvents>;

/** The desktop context layered over the platform-neutral core context. */
export interface DesktopExtensionContext extends ExtensionContext {
  readonly commands: Registrar<DesktopExtensionCommand>;
  readonly panels: Registrar<DesktopExtensionPanel>;
  readonly editorHooks: Registrar<DesktopExtensionEditorHook>;
  /**
   * Editor-header contributions (D44).
   *
   * Separate from `editorHooks`, which stays limited to CodeMirror extensions
   * and keybindings: a header is a React surface, and overloading one surface
   * with both would tie a component's lifetime to CodeMirror's.
   */
  readonly editorHeaders: Registrar<DesktopExtensionEditorHeader>;
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
}

const DOTTED_IDENTIFIER_PATTERN = /^[A-Za-z][A-Za-z0-9_-]*(?:\.[A-Za-z][A-Za-z0-9_-]*)*$/;

/**
 * Qualifies an extension-local contribution id into its registry-wide
 * `extensionId.localId` form.
 *
 * The single constructor for the convention: a bootstrap stub and the real
 * registration that replaces it must agree byte-for-byte, so both build the id
 * here rather than concatenating inline.
 */
export function qualifyContributionId(extensionId: string, localId: string): string {
  return `${extensionId}.${localId}`;
}

/**
 * Splits a qualified contribution id back into its extension and local parts,
 * or `null` when `fullId` is not in `extensionId.localId` form.
 */
export function splitContributionId(
  fullId: string
): { readonly extensionId: string; readonly localId: string } | null {
  const dot = fullId.indexOf(".");
  if (dot <= 0 || dot === fullId.length - 1) return null;
  return { extensionId: fullId.slice(0, dot), localId: fullId.slice(dot + 1) };
}

function assertRelativeId(kind: string, id: string): void {
  if (typeof id !== "string" || !EXTENSION_ID_PATTERN.test(id)) {
    throw new Error(
      `${kind} id "${id}" must be a lowercase kebab-case relative identifier.`
    );
  }
}

function prefixId(extensionId: string, kind: string, id: string): string {
  assertRelativeId(kind, id);
  return qualifyContributionId(extensionId, id);
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

/**
 * The settings module namespace one extension's schema is registered under,
 * `extension-${extensionId}`.
 *
 * Exported so a lookup of an extension's setting key — like
 * `extension-journal-calendar.root` — does not have to hand-concatenate the
 * prefix and risk drifting from it.
 */
export function extensionSettingsModuleId(extensionId: string): string {
  return `extension-${extensionId}`;
}

function assertLocalKey(key: string): void {
  if (typeof key !== "string" || !DOTTED_IDENTIFIER_PATTERN.test(key)) {
    throw new Error(`Setting key "${key}" must be a relative extension-local key.`);
  }
}

function fullSettingKey(
  registry: SettingsRegistry,
  extensionId: string,
  key: string
): { fullKey: string; definition: SettingDefinition } {
  assertLocalKey(key);
  const moduleId = extensionSettingsModuleId(extensionId);
  const fullKey = `${moduleId}.${key}`;
  const definition = registry.getDefinition(fullKey);
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
  /**
   * The schema registry and value store behind `context.settings`.
   *
   * Inject the pair together: the store resolves scopes and serializes
   * through the registry it was created with, so pointing the two at
   * different registries would validate against one schema set and read
   * another.
   */
  readonly settingsRegistry: typeof appSettingsRegistry;
  readonly settingsStore: typeof useSettingsStore;
  /** The event bus behind `context.events`. */
  readonly events: typeof appEvents;
  /** The notes API behind `context.workspace`. */
  readonly workspace: DesktopExtensionWorkspace;
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
  subscribeRoot: (listener) =>
    subscribeWorkspaceBridge((bridge) => listener(bridge?.rootPath ?? null)),
  entries: workspaceDesktopApi
});

/** Creates a scoped desktop context for one host-controlled lifecycle. */
function createDesktopExtensionContext(
  context: ExtensionContext,
  isActive: () => boolean,
  registries: DesktopExtensionHostRegistries
): DesktopExtensionContext {
  const moduleId = extensionSettingsModuleId(context.extensionId);
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
      const registration = registries.settingsRegistry.register(namespaceSchema(moduleId, schema));
      return own(context, registration);
    },
    get: <T>(key: string): T | undefined => {
      assertActive();
      const { fullKey, definition } = fullSettingKey(registries.settingsRegistry, context.extensionId, key);
      const state = registries.settingsStore.getState();
      return effectiveSettingValue(state, definition, fullKey) as T | undefined;
    },
    set: (key, value) => {
      // Validates synchronously and persists asynchronously (D81): a foreign key
      // is a programming error and must fail even for a caller that never
      // awaits, while the write itself has no Save bar to wait for.
      //
      // The scoped write path persists only this key — unlike the palette's
      // `setSettingImmediately`, which flushes every staged change (acceptable
      // there because the palette and the Settings tab are not driven at the
      // same time). An extension can write on a timer or an event, so a
      // co-flush could persist user edits prematurely or strand this key as
      // phantom-dirty when an unrelated staged value fails validation.
      assertActive();
      const { fullKey } = fullSettingKey(registries.settingsRegistry, context.extensionId, key);
      return registries.settingsStore.getState().setSingleSettingImmediately(fullKey, value);
    },
    onDidChange: (key, listener) => {
      assertActive();
      const { fullKey, definition } = fullSettingKey(registries.settingsRegistry, context.extensionId, key);
      let previous = effectiveSettingValue(registries.settingsStore.getState(), definition, fullKey);
      const subscription = registries.settingsStore.subscribe((state) => {
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
        return own(context, registries.events.on(event, listener));
      }
    },
    workspace: {
      // The workspace object is shared across extensions, so the one
      // subscription it offers is scoped here — same treatment `events.on`
      // gets — rather than inside the surface itself.
      ...registries.workspace,
      onDidChangeRoot: (listener) => {
        assertActive();
        return own(context, registries.workspace.onDidChangeRoot(listener));
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
  const resolved: DesktopExtensionHostRegistries = {
    commands: desktopCommandRegistry,
    panels: desktopPanelRegistry,
    editorHooks: markdownEditorHookRegistry,
    editorHeaders: desktopEditorHeaderRegistry,
    tabs: desktopTabRegistry,
    settingsRegistry: appSettingsRegistry,
    settingsStore: useSettingsStore,
    events: appEvents,
    workspace: extensionWorkspace,
    ...registries
  };

  const register = (extension: DesktopExtensionDefinition): Disposable => {
    let active = false;
    /**
     * One desktop context per activation, shared by `activate` and
     * `deactivate`: the core host hands both the same `ExtensionContext`, and
     * a deactivate hook must see what this activation registered — including
     * the tab kinds `open` is scoped to.
     */
    let scoped:
      | { readonly core: ExtensionContext; readonly desktop: DesktopExtensionContext }
      | undefined;
    const contextFor = (core: ExtensionContext): DesktopExtensionContext => {
      if (scoped?.core !== core) {
        scoped = { core, desktop: createDesktopExtensionContext(core, () => active, resolved) };
      }
      return scoped.desktop;
    };
    const coreDefinition: ExtensionDefinition = {
      ...extension,
      activate: async (context) => {
        active = true;
        try {
          return await extension.activate(contextFor(context));
        } catch (error: unknown) {
          active = false;
          throw error;
        }
      },
      deactivate: async (context) => {
        // `active` is raised again for the hook: the core host calls
        // deactivate to clean up a "failed" record too, and a cleanup hook
        // that follows a failed activation must still have a live context.
        active = true;
        try {
          if (extension.deactivate) {
            await extension.deactivate(contextFor(context));
          }
        } finally {
          active = false;
        }
      }
    };
    return coreHost.register(coreDefinition);
  };

  return {
    register,
    activate: coreHost.activate,
    deactivate: coreHost.deactivate,
    status: coreHost.status,
    statuses: coreHost.statuses,
    dispose: coreHost.dispose
  };
}

/** Shared lifecycle surface for desktop bootstrap and future first-party built-ins. */
export const desktopExtensionHost = createDesktopExtensionHost();