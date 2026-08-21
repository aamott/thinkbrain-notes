import { useEffect, useMemo, useRef, type ReactNode } from "react";

import type { Disposable } from "@thinkbrain/core";

import type { DesktopPanelContext } from "./panelRegistryModel";

/**
 * The framework-neutral panel contract for extensions.
 *
 * A built-in extension shares the app's React instance and can contribute a
 * panel as a render factory. An extension loaded from disk cannot: it is a
 * pre-bundled module, and any React it imported would be a second copy of the
 * library, breaking hooks across the boundary. So the public contract is DOM,
 * not React — the extension receives an element and owns everything inside it.
 *
 * This component is the adapter between the two. The shell keeps rendering
 * React panels; a mounted panel is a React panel whose body happens to be
 * handed to an extension.
 */

/** Host state a mounted panel renders from. */
export interface ExtensionPanelState {
  /** Current workspace root, or `null` before a workspace is opened. */
  readonly rootPath: string | null;
  /** Ready contents of the active Markdown document, or `null`. */
  readonly documentContents: string | null;
}

/** The handle a mounted panel receives alongside its element. */
export interface ExtensionPanelMountContext {
  /** State at mount time. Later values arrive through {@link onDidChange}. */
  readonly state: ExtensionPanelState;
  /**
   * Subscribes to host state changes until the panel unmounts.
   *
   * A mounted panel is mounted once, so this — not a re-render — is how it
   * learns that the open note or workspace changed.
   */
  onDidChange(listener: (state: ExtensionPanelState) => void): Disposable;
}

/**
 * Fills an element with panel content.
 *
 * @returns An optional cleanup for anything that outlives the element itself,
 *   such as timers or listeners. The element's own children are discarded by
 *   the host.
 */
export type ExtensionPanelMount = (
  element: HTMLElement,
  context: ExtensionPanelMountContext
) => void | (() => void);

export interface ExtensionPanelMountPointProps {
  readonly mount: ExtensionPanelMount;
  readonly rootPath: string | null;
  readonly documentContents: string | null;
  /** Receives anything the panel throws. Defaults to a console report. */
  readonly onError?: (error: unknown) => void;
}

function reportToConsole(error: unknown): void {
  console.error("[extensions] A panel failed.", error);
}

/**
 * Replaces a failed panel's contents with an explanation.
 *
 * Written into the element rather than rendered as React state: the host
 * already owns this element, and a state update from inside a mount effect
 * would cascade an extra render on every panel that fails.
 */
function showFailure(element: HTMLElement): void {
  const message = element.ownerDocument.createElement("p");
  message.setAttribute("role", "alert");
  message.className = "m-0 p-4 text-danger text-xs";
  message.textContent = "This panel failed to render. See the Extensions panel for details.";
  element.replaceChildren(message);
}

export function ExtensionPanelMountPoint({
  mount,
  rootPath,
  documentContents,
  onError = reportToConsole
}: ExtensionPanelMountPointProps) {
  const elementRef = useRef<HTMLDivElement>(null);
  const listenersRef = useRef(new Set<(state: ExtensionPanelState) => void>());

  const state = useMemo<ExtensionPanelState>(
    () => ({ rootPath, documentContents }),
    [rootPath, documentContents]
  );

  // The state the panel has already seen. Seeded at mount so the first change
  // effect, which runs immediately after mounting, stays quiet.
  const deliveredRef = useRef(state);
  // Read inside the mount effect so a state change between render and effect
  // cannot hand the panel a stale snapshot without a matching notification.
  const stateRef = useRef(state);
  const onErrorRef = useRef(onError);

  // Declared first, so both refs are current before the effects below run.
  useEffect(() => {
    stateRef.current = state;
    onErrorRef.current = onError;
  });

  useEffect(() => {
    const element = elementRef.current;
    if (!element) return;

    const listeners = listenersRef.current;
    deliveredRef.current = stateRef.current;

    const context: ExtensionPanelMountContext = {
      state: stateRef.current,
      onDidChange: (listener) => {
        listeners.add(listener);
        return {
          dispose: () => {
            listeners.delete(listener);
          }
        };
      }
    };

    let cleanup: (() => void) | void;
    try {
      cleanup = mount(element, context);
    } catch (error: unknown) {
      // The panel is trusted code, but a throw in one panel must not take the
      // shell down with it.
      showFailure(element);
      onErrorRef.current(error);
    }

    return () => {
      listeners.clear();
      try {
        cleanup?.();
      } catch (error: unknown) {
        onErrorRef.current(error);
      }
      element.replaceChildren();
    };
  }, [mount]);

  useEffect(() => {
    if (deliveredRef.current === state) return;
    deliveredRef.current = state;
    // Snapshot first: a listener that unsubscribes during delivery must not
    // change what this pass delivers.
    for (const listener of [...listenersRef.current]) {
      try {
        listener(state);
      } catch (error: unknown) {
        onErrorRef.current(error);
      }
    }
  }, [state]);

  return <div ref={elementRef} className="h-full" />;
}

/**
 * Adapts a mount function into the render factory the panel registry stores.
 * Only the framework-neutral slice is forwarded (rootPath + documentContents);
 * React props for first-party panels are not exposed to extensions.
 * `documentContents` is coalesced to `null` for left-side extension panels,
 * whose context no longer carries it.
 */
// eslint-disable-next-line react-refresh/only-export-components -- factory for non-tsx extension host
export function createExtensionPanelMountFactory(
  mount: ExtensionPanelMount
): (context: DesktopPanelContext) => ReactNode {
  return (context) => (
    <ExtensionPanelMountPoint
      mount={mount}
      rootPath={context.rootPath}
      documentContents={context.documentContents ?? null}
    />
  );
}
