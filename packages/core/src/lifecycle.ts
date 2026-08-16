/** Platform-neutral ownership and trusted extension lifecycle primitives. */

/** A resource that can be released once it is no longer needed. */
export interface Disposable {
  dispose(): void | Promise<void>;
}

/** Error raised when one or more owned resources fail during disposal. */
export class DisposableError extends Error {
  readonly errors: readonly unknown[];

  constructor(errors: readonly unknown[]) {
    super(`Failed to dispose ${errors.length} resource${errors.length === 1 ? "" : "s"}.`);
    this.name = "DisposableError";
    this.errors = errors;
  }
}

export interface DisposableStore extends Disposable {
  /** Adds a resource and returns an idempotent handle for that resource. */
  add(disposable: Disposable): Disposable;
}

const isPromiseLike = (value: void | Promise<void>): value is Promise<void> =>
  typeof value === "object" && value !== null && "then" in value;

/** Clears a cached disposal promise once it settles (fulfilled or rejected). */
const resetOnSettle = (p: Promise<void>, reset: () => void): void => {
  void p.then(reset, reset);
};

/** Creates a reverse-order, idempotent collection of owned resources. */
export function createDisposableStore(): DisposableStore {
  const resources: Disposable[] = [];
  let disposed = false;
  let disposalPromise: Promise<void> | undefined;

  const add = (disposable: Disposable): Disposable => {
    let released = false;
    const owned: Disposable = {
      dispose: (): void | Promise<void> => {
        if (released) {
          return;
        }
        released = true;
        return disposable.dispose();
      }
    };

    if (disposed) {
      const result = owned.dispose();
      if (isPromiseLike(result)) {
        void result.catch(() => undefined);
      }
      return owned;
    }
    resources.push(owned);
    return owned;
  };

  const dispose = (): void | Promise<void> => {
    if (disposalPromise) {
      return disposalPromise;
    }
    if (disposed) {
      return;
    }
    disposed = true;

    const errors: unknown[] = [];
    const pending: Promise<void>[] = [];
    for (const resource of resources.reverse()) {
      try {
        const result = resource.dispose();
        if (isPromiseLike(result)) {
          pending.push(result.catch((error: unknown) => {
            errors.push(error);
          }));
        }
      } catch (error: unknown) {
        errors.push(error);
      }
    }
    resources.length = 0;

    if (pending.length === 0) {
      if (errors.length > 0) {
        throw new DisposableError(errors);
      }
      return;
    }
    disposalPromise = Promise.all(pending).then(() => {
      if (errors.length > 0) {
        throw new DisposableError(errors);
      }
    });
    const completedDisposal = disposalPromise;
    resetOnSettle(completedDisposal, () => {
      if (disposalPromise === completedDisposal) disposalPromise = undefined;
    });
    return completedDisposal;
  };

  return { add, dispose };
}

/** The context owned by one extension activation. */
export interface ExtensionContext {
  readonly extensionId: string;
  readonly subscriptions: DisposableStore;
}

export type ExtensionActivationResult = void | Disposable | readonly Disposable[];
export type ExtensionActivation = (
  context: ExtensionContext
) => ExtensionActivationResult | Promise<ExtensionActivationResult>;
export type ExtensionDeactivation = (
  context: ExtensionContext
) => void | Promise<void>;

/** A trusted same-context extension definition. */
export interface ExtensionDefinition {
  readonly id: string;
  /** Definitions are trusted by default; explicit false is rejected by the host. */
  readonly trusted?: boolean;
  readonly activate: ExtensionActivation;
  readonly deactivate?: ExtensionDeactivation;
}

export type ExtensionStatus =
  | "registered"
  | "activating"
  | "active"
  | "deactivating"
  | "inactive"
  | "failed";

export interface ExtensionStatusEntry {
  readonly id: string;
  readonly status: ExtensionStatus;
}

export class ExtensionHostError extends Error {
  readonly extensionId: string;
  readonly cause: unknown;

  constructor(message: string, extensionId: string, cause?: unknown) {
    super(message);
    this.name = "ExtensionHostError";
    this.extensionId = extensionId;
    this.cause = cause;
  }
}

/** Extension IDs are stable namespace keys and use lowercase kebab-case only. */
export const EXTENSION_ID_PATTERN = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;

export class InvalidExtensionIdError extends ExtensionHostError {
  constructor(extensionId: string) {
    super(
      `Extension id "${extensionId}" must match lowercase kebab-case [a-z][a-z0-9]*(?:-[a-z0-9]+)*.`,
      extensionId
    );
    this.name = "InvalidExtensionIdError";
  }
}

const assertExtensionId = (extensionId: string): void => {
  if (typeof extensionId !== "string" || !EXTENSION_ID_PATTERN.test(extensionId)) {
    throw new InvalidExtensionIdError(extensionId);
  }
};

export class DuplicateExtensionError extends ExtensionHostError {
  constructor(extensionId: string) {
    super(`An extension is already registered for id "${extensionId}".`, extensionId);
    this.name = "DuplicateExtensionError";
  }
}

export class UntrustedExtensionError extends ExtensionHostError {
  constructor(extensionId: string) {
    super(`Extension "${extensionId}" is not trusted.`, extensionId);
    this.name = "UntrustedExtensionError";
  }
}

export class ExtensionActivationError extends ExtensionHostError {
  readonly cleanupError: unknown;

  constructor(extensionId: string, cause: unknown, cleanupError?: unknown) {
    super(`Failed to activate extension "${extensionId}".`, extensionId, cause);
    this.name = "ExtensionActivationError";
    this.cleanupError = cleanupError;
  }
}

export class ExtensionDeactivationError extends ExtensionHostError {
  readonly cleanupError: unknown;

  constructor(extensionId: string, cause: unknown, cleanupError?: unknown) {
    super(`Failed to deactivate extension "${extensionId}".`, extensionId, cause);
    this.name = "ExtensionDeactivationError";
    this.cleanupError = cleanupError;
  }
}

export interface ExtensionHost extends Disposable {
  register(extension: ExtensionDefinition): Disposable;
  activate(id: string): Promise<void>;
  deactivate(id: string): Promise<void>;
  status(id: string): ExtensionStatus | undefined;
  statuses(): readonly ExtensionStatusEntry[];
}

interface ExtensionRecord {
  readonly definition: ExtensionDefinition;
  status: ExtensionStatus;
  context: ExtensionContext | undefined;
  activation: Promise<void> | undefined;
  deactivation: Promise<void> | undefined;
}

const unknownExtension = (id: string): ExtensionHostError =>
  new ExtensionHostError(`No extension is registered for id "${id}".`, id);

const disposeActivationResult = (
  context: ExtensionContext,
  result: ExtensionActivationResult
): void => {
  if (result === undefined) {
    return;
  }
  if ("dispose" in result) {
    context.subscriptions.add(result);
    return;
  }
  for (const disposable of result) {
    context.subscriptions.add(disposable);
  }
};

/** Creates a host for trusted, same-context extension definitions. */
export function createExtensionHost(): ExtensionHost {
  const records = new Map<string, ExtensionRecord>();
  let disposed = false;
  let hostDisposalPromise: Promise<void> | undefined;

  const register = (extension: ExtensionDefinition): Disposable => {
    assertExtensionId(extension.id);
    if (disposed) {
      throw new ExtensionHostError("The extension host has been disposed.", extension.id);
    }
    if (extension.trusted === false) {
      throw new UntrustedExtensionError(extension.id);
    }
    if (records.has(extension.id)) {
      throw new DuplicateExtensionError(extension.id);
    }

    const record: ExtensionRecord = {
      definition: extension,
      status: "registered",
      context: undefined,
      activation: undefined,
      deactivation: undefined
    };
    records.set(extension.id, record);
    let unregistered = false;

    return {
      dispose: (): void | Promise<void> => {
        if (unregistered) {
          return;
        }
        unregistered = true;
        if (records.get(extension.id) !== record) {
          return;
        }
        if (!record.activation && !record.deactivation &&
            record.status !== "active" && record.status !== "failed") {
          records.delete(extension.id);
          return;
        }

        const unregister = async (): Promise<void> => {
          let error: unknown;
          try {
            if (record.activation) {
              try {
                await record.activation;
              } catch (activationError: unknown) {
                error = activationError;
              }
            }
            if (record.deactivation) {
              try {
                await record.deactivation;
              } catch (deactivationError: unknown) {
                error ??= deactivationError;
              }
            } else if (records.get(extension.id) === record &&
                       (record.status === "active" || record.status === "failed")) {
              try {
                await deactivate(extension.id);
              } catch (deactivationError: unknown) {
                error ??= deactivationError;
              }
            }
          } finally {
            if (records.get(extension.id) === record) {
              records.delete(extension.id);
            }
          }
          if (error !== undefined) {
            throw error;
          }
        };
        return unregister();
      }
    };
  };

  const activate = async (id: string): Promise<void> => {
    if (disposed) {
      throw new ExtensionHostError("The extension host has been disposed.", id);
    }
    const record = records.get(id);
    if (!record) {
      throw unknownExtension(id);
    }
    if (record.status === "active") {
      return;
    }
    if (record.activation) {
      return record.activation;
    }

    record.status = "activating";
    const context: ExtensionContext = {
      extensionId: id,
      subscriptions: createDisposableStore()
    };
    record.context = context;
    const activation = (async (): Promise<void> => {
      try {
        const result = await record.definition.activate(context);
        disposeActivationResult(context, result);
        record.status = "active";
      } catch (error: unknown) {
        record.status = "failed";
        let cleanupError: unknown;
        try {
          await context.subscriptions.dispose();
        } catch (cleanup: unknown) {
          cleanupError = cleanup;
        }
        throw new ExtensionActivationError(id, error, cleanupError);
      } finally {
        record.activation = undefined;
      }
    })();
    record.activation = activation;
    return activation;
  };

  const deactivate = async (id: string): Promise<void> => {
    const record = records.get(id);
    if (!record) {
      throw unknownExtension(id);
    }
    if (record.deactivation) {
      return record.deactivation;
    }
    if (record.status === "registered" || record.status === "inactive") {
      return;
    }

    const deactivation = (async (): Promise<void> => {
      if (record.activation) {
        try {
          await record.activation;
        } catch (error: unknown) {
          // Activation already performed its own subscription cleanup. Continue
          // through deactivation so a concurrent caller cannot strand a failed
          // record in the host; the activation error was reported to its caller.
          if (record.status !== "failed") {
            throw error;
          }
        }
      }
      if (record.status !== "active" && record.status !== "failed") {
        return;
      }

      record.status = "deactivating";
      const context = record.context;
      let hookError: unknown;
      let cleanupError: unknown;
      try {
        if (context && record.definition.deactivate) {
          await record.definition.deactivate(context);
        }
      } catch (error: unknown) {
        hookError = error;
      }
      try {
        if (context) {
          await context.subscriptions.dispose();
        }
      } catch (error: unknown) {
        cleanupError = error;
      }
      record.context = undefined;
      record.status = "inactive";
      if (hookError !== undefined || cleanupError !== undefined) {
        throw new ExtensionDeactivationError(id, hookError ?? cleanupError, cleanupError);
      }
    })();
    record.deactivation = deactivation;
    try {
      await deactivation;
    } finally {
      record.deactivation = undefined;
    }
  };

  const dispose = (): Promise<void> => {
    if (hostDisposalPromise) {
      return hostDisposalPromise;
    }
    if (disposed) {
      return Promise.resolve();
    }
    disposed = true;
    hostDisposalPromise = (async (): Promise<void> => {
      const errors: unknown[] = [];
      const pending = [...records.keys()].map(async (id) => {
        try {
          await deactivate(id);
        } catch (error: unknown) {
          errors.push(error);
        }
      });
      await Promise.all(pending);
      records.clear();
      if (errors.length > 0) {
        throw new DisposableError(errors);
      }
    })();
    const completedDisposal = hostDisposalPromise;
    resetOnSettle(completedDisposal, () => {
      if (hostDisposalPromise === completedDisposal) hostDisposalPromise = undefined;
    });
    return completedDisposal;
  };

  return {
    register,
    activate,
    deactivate,
    status: (id): ExtensionStatus | undefined => records.get(id)?.status,
    statuses: (): readonly ExtensionStatusEntry[] =>
      [...records.values()].map((record) => ({
        id: record.definition.id,
        status: record.status
      })),
    dispose
  };
}
