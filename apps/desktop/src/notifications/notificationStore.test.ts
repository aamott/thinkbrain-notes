import { beforeEach, describe, expect, it } from "vitest";

import {
  resetNotificationStore,
  useNotificationStore
} from "./notificationStore";
import type { NotificationInput } from "./notificationTypes";

function transientError(overrides: Partial<NotificationInput> = {}): NotificationInput {
  return {
    source: "sync",
    dedupKey: "sync:test",
    title: "Sync needs attention",
    message: "Something broke.",
    severity: "transient",
    variant: "error",
    ...overrides
  };
}

beforeEach(() => {
  resetNotificationStore();
});

describe("addNotification", () => {
  it("appends a new notification and surfaces it as the active toast", () => {
    const id = useNotificationStore.getState().addNotification(transientError());

    const state = useNotificationStore.getState();
    expect(state.notifications).toHaveLength(1);
    expect(state.notifications[0]?.id).toBe(id);
    expect(state.activeToast?.id).toBe(id);
    expect(state.activeToast?.dismissed).toBe(false);
  });

  it("assigns id and createdAt; the input does not supply them", () => {
    const before = Date.now();
    const id = useNotificationStore.getState().addNotification(transientError());
    const after = Date.now();

    const item = useNotificationStore.getState().notifications[0];
    expect(item?.id).toBe(id);
    expect(item?.createdAt).toBeGreaterThanOrEqual(before);
    expect(item?.createdAt).toBeLessThanOrEqual(after);
  });

  it("silent notifications log but never become the active toast", () => {
    useNotificationStore.getState().addNotification(
      transientError({ severity: "silent", dedupKey: "sync:silent" })
    );

    const state = useNotificationStore.getState();
    expect(state.notifications).toHaveLength(1);
    expect(state.activeToast).toBeNull();
  });
});

describe("dedup by dedupKey", () => {
  it("updates an existing entry in place rather than appending", () => {
    useNotificationStore.getState().addNotification(
      transientError({ message: "first" })
    );
    useNotificationStore.getState().addNotification(
      transientError({ message: "second" })
    );

    const state = useNotificationStore.getState();
    expect(state.notifications).toHaveLength(1);
    expect(state.notifications[0]?.message).toBe("second");
  });

  it("un-dismisses a re-raised deduped notification", () => {
    const id = useNotificationStore.getState().addNotification(transientError());
    useNotificationStore.getState().dismissNotification(id);
    expect(useNotificationStore.getState().notifications[0]?.dismissed).toBe(true);

    useNotificationStore.getState().addNotification(
      transientError({ message: "re-raised" })
    );

    const state = useNotificationStore.getState();
    expect(state.notifications).toHaveLength(1);
    expect(state.notifications[0]?.dismissed).toBe(false);
    expect(state.activeToast?.id).toBe(state.notifications[0]?.id);
  });

  it("appends when no dedupKey is supplied", () => {
    useNotificationStore.getState().addNotification(
      transientError({ dedupKey: undefined, message: "a" })
    );
    useNotificationStore.getState().addNotification(
      transientError({ dedupKey: undefined, message: "b" })
    );

    expect(useNotificationStore.getState().notifications).toHaveLength(2);
  });
});

describe("dismissNotification", () => {
  it("marks the entry dismissed and clears the active toast", () => {
    const id = useNotificationStore.getState().addNotification(transientError());
    useNotificationStore.getState().dismissNotification(id);

    const state = useNotificationStore.getState();
    expect(state.notifications[0]?.dismissed).toBe(true);
    expect(state.activeToast).toBeNull();
  });

  it("is a no-op for an unknown id", () => {
    useNotificationStore.getState().addNotification(transientError());
    useNotificationStore.getState().dismissNotification("does-not-exist");

    expect(useNotificationStore.getState().notifications).toHaveLength(1);
    expect(useNotificationStore.getState().notifications[0]?.dismissed).toBe(false);
  });
});

describe("clearAll", () => {
  it("empties the log and the toast", () => {
    useNotificationStore.getState().addNotification(transientError());
    useNotificationStore.getState().addNotification(
      transientError({ dedupKey: "sync:other", source: "extension:x" })
    );
    useNotificationStore.getState().clearAll();

    const state = useNotificationStore.getState();
    expect(state.notifications).toHaveLength(0);
    expect(state.activeToast).toBeNull();
  });
});

describe("clearBySource", () => {
  it("removes only entries from the named source", () => {
    useNotificationStore.getState().addNotification(
      transientError({ source: "sync", dedupKey: "sync:1" })
    );
    useNotificationStore.getState().addNotification(
      transientError({ source: "extension:x", dedupKey: "ext:1" })
    );

    useNotificationStore.getState().clearBySource("sync");

    const state = useNotificationStore.getState();
    expect(state.notifications).toHaveLength(1);
    expect(state.notifications[0]?.source).toBe("extension:x");
    // The sync toast is gone; the extension entry is transient, so it is now
    // the active toast.
    expect(state.activeToast?.source).toBe("extension:x");
  });

  it("promotes the next non-silent notification to the toast after clearing", () => {
    useNotificationStore.getState().addNotification(
      transientError({ source: "sync", dedupKey: "sync:1", severity: "sticky" })
    );
    useNotificationStore.getState().addNotification(
      transientError({
        source: "extension:x",
        dedupKey: "ext:1",
        severity: "transient"
      })
    );
    // Sticky sync toast wins (most recent).
    expect(useNotificationStore.getState().activeToast?.source).toBe("sync");

    useNotificationStore.getState().clearBySource("sync");

    expect(useNotificationStore.getState().activeToast?.source).toBe("extension:x");
  });
});

describe("activeToast selection", () => {
  it("picks the most recent non-dismissed, non-silent notification", () => {
    const first = useNotificationStore.getState().addNotification(
      transientError({ dedupKey: "sync:1", message: "first" })
    );
    const second = useNotificationStore.getState().addNotification(
      transientError({ dedupKey: "sync:2", message: "second" })
    );
    expect(useNotificationStore.getState().activeToast?.id).toBe(second);

    useNotificationStore.getState().dismissNotification(second);
    expect(useNotificationStore.getState().activeToast?.id).toBe(first);
  });
});
