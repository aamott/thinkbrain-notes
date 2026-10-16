/**
 * Scroll anchoring: keeps a scroll container parked on the same content
 * across events that would otherwise lose or drift the position — a whole-
 * document reflow (root font-size change from `ui.scale`), or an unmount /
 * hide / remount cycle.
 *
 * Elements opt in with `data-scroll-anchor-key` naming a stable identity
 * (a setting key, `"section:<id>"`, …). A snapshot remembers which anchor
 * was nearest the container's top and its viewport-relative offset, so a
 * restore can shift `scrollTop` by the delta rather than storing a raw
 * pixel position that a reflow invalidates.
 *
 * Two consumers share the machinery:
 * - `useScrollAnchor` keeps a per-key snapshot for containers that unmount
 *   or hide (the settings document across tab switches).
 * - `captureRegisteredScrollAnchors` / `restoreRegisteredScrollAnchors`
 *   let the ui.scale writer bracket a root font-size change with a
 *   capture/restore of every visible registered container.
 */

import { useLayoutEffect, useRef, type RefObject } from "react";

/** Attribute naming an element a stable scroll anchor. */
export const SCROLL_ANCHOR_ATTR = "data-scroll-anchor-key";

export interface ScrollAnchorSnapshot {
  /** Anchor element's key, or null when no candidate was visible. */
  readonly key: string | null;
  /** Anchor top minus container top (px) at capture — viewport-relative. */
  readonly offset: number;
  /** Raw scrollTop at capture; fallback when the anchor element is gone. */
  readonly scrollTop: number;
}

/** Enough for any plausible working set of hidden surfaces — a backstop. */
const SNAPSHOT_LIMIT = 24;

const savedSnapshots = new Map<string, ScrollAnchorSnapshot>();

/** LRU-set: re-insert to keep the newest key last, then trim the oldest. */
function saveSnapshot(key: string, snapshot: ScrollAnchorSnapshot): void {
  savedSnapshots.delete(key);
  savedSnapshots.set(key, snapshot);
  while (savedSnapshots.size > SNAPSHOT_LIMIT) {
    const oldest = savedSnapshots.keys().next();
    if (oldest.done) break;
    savedSnapshots.delete(oldest.value);
  }
}

/** Drops every saved snapshot — test isolation. */
export function clearScrollAnchorSnapshots(): void {
  savedSnapshots.clear();
}

function anchorKeyOf(element: Element): string | null {
  return element.getAttribute(SCROLL_ANCHOR_ATTR);
}

/** Whether the element's box overlaps the container's visible rect. */
function isVisibleIn(element: HTMLElement, containerRect: DOMRect): boolean {
  const rect = element.getBoundingClientRect();
  return rect.bottom > containerRect.top && rect.top < containerRect.bottom;
}

/**
 * Finds the anchor nearest the container's top and snapshots its offset.
 *
 * Priority: the anchor containing the focused element (a control the user
 * is interacting with wins), then the first visible row anchor, then the
 * first visible section anchor — rows carry the finer-grained keys.
 */
export function captureScrollAnchor(container: HTMLElement): ScrollAnchorSnapshot {
  const containerRect = container.getBoundingClientRect();
  const scrollTop = container.scrollTop;

  const focused = document.activeElement?.closest?.(`[${SCROLL_ANCHOR_ATTR}]`);
  if (
    focused instanceof HTMLElement &&
    container.contains(focused) &&
    isVisibleIn(focused, containerRect)
  ) {
    return {
      key: anchorKeyOf(focused),
      offset: focused.getBoundingClientRect().top - containerRect.top,
      scrollTop
    };
  }

  const rows: HTMLElement[] = [];
  const sections: HTMLElement[] = [];
  for (const el of container.querySelectorAll<HTMLElement>(`[${SCROLL_ANCHOR_ATTR}]`)) {
    (anchorKeyOf(el)?.startsWith("section:") ? sections : rows).push(el);
  }
  const pick = [...rows, ...sections].find((el) => isVisibleIn(el, containerRect));
  if (!pick) return { key: null, offset: 0, scrollTop };
  return {
    key: anchorKeyOf(pick),
    offset: pick.getBoundingClientRect().top - containerRect.top,
    scrollTop
  };
}

/**
 * Re-lands the container on the captured anchor: shifts `scrollTop` by the
 * delta between the element's recorded offset and where it sits now, so a
 * reflowed document keeps the same content in view. Falls back to the raw
 * `scrollTop` when the anchor element no longer exists.
 */
export function restoreScrollAnchor(
  container: HTMLElement,
  snapshot: ScrollAnchorSnapshot
): void {
  if (snapshot.key !== null) {
    const el = container.querySelector<HTMLElement>(
      `[${SCROLL_ANCHOR_ATTR}="${CSS.escape(snapshot.key)}"]`
    );
    if (el) {
      const drift =
        el.getBoundingClientRect().top -
        container.getBoundingClientRect().top -
        snapshot.offset;
      container.scrollTop += drift;
      return;
    }
  }
  container.scrollTop = snapshot.scrollTop;
}

/** A visible container that live capture/restore should include. */
interface RegisteredScroller {
  readonly id: number;
  readonly container: HTMLElement;
}

const registered = new Map<number, RegisteredScroller>();
let nextRegistrationId = 1;

/**
 * Snapshots every registered (visible, mounted) scroller. Pair with
 * `restoreRegisteredScrollAnchors` around a change that reflows all
 * content — e.g. writing the root font size.
 */
export function captureRegisteredScrollAnchors(): Map<number, ScrollAnchorSnapshot> {
  const snapshots = new Map<number, ScrollAnchorSnapshot>();
  for (const entry of registered.values()) {
    if (entry.container.isConnected && entry.container.clientHeight > 0) {
      snapshots.set(entry.id, captureScrollAnchor(entry.container));
    }
  }
  return snapshots;
}

/** Applies snapshots from `captureRegisteredScrollAnchors` to live containers. */
export function restoreRegisteredScrollAnchors(
  snapshots: ReadonlyMap<number, ScrollAnchorSnapshot>
): void {
  for (const [id, snapshot] of snapshots) {
    const entry = registered.get(id);
    if (entry && entry.container.isConnected) {
      restoreScrollAnchor(entry.container, snapshot);
    }
  }
}

/**
 * Anchors one scroll container to a stable key across hide/show and
 * remount cycles.
 *
 * On mount (or re-activation) the saved snapshot is restored — or, for a
 * key never visited, the container resets to the top rather than keeping
 * whatever scroll position the previous key left behind. A passive
 * scroll listener keeps the recorded anchor fresh. A hidden container
 * (`display:none`, clientHeight 0) is never captured, so hiding can never
 * overwrite a good snapshot with a collapsed one — the last valid
 * event-recorded snapshot stays authoritative through cleanup.
 *
 * Args:
 *   ref: The scroll container element.
 *   key: Stable cache key for this surface (e.g. `"settings:<root>"`).
 *   active: Whether the container is the visible route right now.
 */
export function useScrollAnchor(
  ref: RefObject<HTMLElement | null>,
  key: string,
  active = true
): void {
  // Last snapshot this mount recorded, tagged with its key — survives an
  // unmount racing LRU eviction but can never leak across keys (a new
  // workspace's surface must not inherit another key's position).
  const lastRef = useRef<{ key: string; snapshot: ScrollAnchorSnapshot } | null>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!active || !el) return;

    const saved = savedSnapshots.get(key) ?? (lastRef.current?.key === key ? lastRef.current.snapshot : undefined);
    if (saved) {
      restoreScrollAnchor(el, saved);
    } else {
      // An unvisited key starts at the top — a reused surface must not keep
      // whatever scroll position the previous key left behind.
      el.scrollTop = 0;
    }

    const id = nextRegistrationId++;
    registered.set(id, { id, container: el });

    const record = (): void => {
      // Never capture a hidden or collapsed scroller — its metrics would
      // overwrite the last good position.
      if (!el.isConnected || el.clientHeight === 0) return;
      const snapshot = captureScrollAnchor(el);
      lastRef.current = { key, snapshot };
      saveSnapshot(key, snapshot);
    };
    record();
    el.addEventListener("scroll", record, { passive: true });

    return () => {
      // No capture here: by cleanup time React may already have rendered
      // new-key content or hidden the surface, so the last *event-recorded*
      // snapshot stays authoritative.
      el.removeEventListener("scroll", record);
      registered.delete(id);
    };
  }, [ref, key, active]);
}
