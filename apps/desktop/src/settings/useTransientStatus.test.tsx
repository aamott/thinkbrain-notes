// @vitest-environment happy-dom

import { act, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useTransientStatus, type TransientStatus } from "./useTransientStatus";

/**
 * Tests for {@link useTransientStatus}.
 *
 * The project does not depend on `@testing-library/react`, so the hook is
 * exercised through a tiny wrapper component rendered with `createRoot` + `act`
 * (the same convention used by the other settings test files). The wrapper
 * exposes the hook's return value via a ref-like captureRef object and also
 * renders the current message so DOM queries can assert what the user would
 * see.
 */

/** Captures the latest hook return value across re-renders. */
interface HookCapture {
  current: TransientStatus | null;
}

/**
 * A minimal component that calls the hook and stashes its return value into the
 * captureRef object, and renders the current message text.
 */
function Probe({ captureRef }: { captureRef: HookCapture }) {
  const status = useTransientStatus();
  // Sync the hook's return value into the captureRef after render so tests can
  // invoke show()/clear() and assert on .message. Using an effect (rather than
  // mutating during render) satisfies the react-hooks/refs lint rule.
  useEffect(() => {
    captureRef.current = status;
  });
  return <span data-testid="message">{status.message ?? ""}</span>;
}

let root: Root | null = null;
let container: HTMLDivElement | null = null;
let captureRef: HookCapture;

beforeEach(() => {
  vi.useFakeTimers();
  captureRef = { current: null };
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => {
    root?.unmount();
  });
  container?.remove();
  root = null;
  container = null;
  vi.useRealTimers();
});

/** Renders the probe and flushes effects. */
async function renderProbe(): Promise<HookCapture> {
  await act(async () => {
    root?.render(<Probe captureRef={captureRef} />);
  });
  return captureRef;
}

/** Reads the rendered message text from the container. */
function messageText(): string {
  const el = container?.querySelector('[data-testid="message"]');
  return el?.textContent ?? "";
}

describe("useTransientStatus", () => {
  it("initial message is null", async () => {
    const cap = await renderProbe();
    expect(cap.current).not.toBeNull();
    expect(cap.current!.message).toBeNull();
    expect(messageText()).toBe("");
  });

  it("show() sets the message immediately", async () => {
    const cap = await renderProbe();
    await act(async () => {
      cap.current!.show("test");
    });
    expect(cap.current!.message).toBe("test");
    expect(messageText()).toBe("test");
  });

  it("auto-clears the message after the default 4000ms delay", async () => {
    const cap = await renderProbe();
    await act(async () => {
      cap.current!.show("test");
    });
    expect(cap.current!.message).toBe("test");

    // Just before the delay elapses, the message is still present.
    await act(async () => {
      vi.advanceTimersByTime(3999);
    });
    expect(cap.current!.message).toBe("test");

    // After the full delay, the message has been cleared.
    await act(async () => {
      vi.advanceTimersByTime(1);
    });
    expect(cap.current!.message).toBeNull();
    expect(messageText()).toBe("");
  });

  it("clear() immediately clears the message and cancels the timeout", async () => {
    const cap = await renderProbe();
    await act(async () => {
      cap.current!.show("test");
    });
    expect(cap.current!.message).toBe("test");

    await act(async () => {
      cap.current!.clear();
    });
    expect(cap.current!.message).toBeNull();

    // Advancing timers should NOT throw or re-trigger any state update.
    await act(async () => {
      vi.advanceTimersByTime(4000);
    });
    expect(cap.current!.message).toBeNull();
  });

  it("calling show() again before the first timeout replaces the message", async () => {
    const cap = await renderProbe();
    await act(async () => {
      cap.current!.show("first");
    });
    expect(cap.current!.message).toBe("first");

    // Advance partway through the first timeout, then show a new message.
    await act(async () => {
      vi.advanceTimersByTime(2000);
    });
    await act(async () => {
      cap.current!.show("second");
    });
    expect(cap.current!.message).toBe("second");

    // The first timeout must have been cancelled: advancing past the original
    // 4000ms window (but not yet past the second 4000ms window) should NOT
    // clear the message.
    await act(async () => {
      vi.advanceTimersByTime(2000);
    });
    expect(cap.current!.message).toBe("second");

    // After the full second delay elapses, the message clears.
    await act(async () => {
      vi.advanceTimersByTime(2000);
    });
    expect(cap.current!.message).toBeNull();
  });

  it("respects a custom delay passed to show()", async () => {
    const cap = await renderProbe();
    await act(async () => {
      cap.current!.show("test", 1000);
    });
    expect(cap.current!.message).toBe("test");

    await act(async () => {
      vi.advanceTimersByTime(999);
    });
    expect(cap.current!.message).toBe("test");

    await act(async () => {
      vi.advanceTimersByTime(1);
    });
    expect(cap.current!.message).toBeNull();
  });

  it("cleans up the timeout on unmount without firing a stale callback", async () => {
    const cap = await renderProbe();
    await act(async () => {
      cap.current!.show("test");
    });
    expect(cap.current!.message).toBe("test");

    // Unmount while the timeout is still pending.
    await act(async () => {
      root?.unmount();
    });

    // Advancing timers after unmount must not throw or log errors. (If the
    // cleanup effect failed to clear the timeout, React would attempt a state
    // update on an unmounted component, which happy-dom would surface as a
    // console.error — we assert no such warning was emitted.)
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      await act(async () => {
        vi.advanceTimersByTime(4000);
      });
      expect(errorSpy).not.toHaveBeenCalled();
    } finally {
      errorSpy.mockRestore();
    }
  });
});
