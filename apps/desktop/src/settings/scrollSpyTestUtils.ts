// @vitest-environment happy-dom

import { vi } from "vitest";

/**
 * Scroll-spy test harness for the settings content area.
 *
 * The scroll-spy listens to `scroll` events on the content container and
 * recomputes the active section from live `getBoundingClientRect` calls.
 * This harness mocks element positions and dispatches synthetic scroll
 * events to drive the recompute logic deterministically.
 */
export function createScrollSpyHarness() {
  const scrollIntoView = vi.fn();
  const originalScrollDescriptor = Object.getOwnPropertyDescriptor(
    HTMLElement.prototype,
    "scrollIntoView"
  );
  const originalGetBoundingClientRect = Object.getOwnPropertyDescriptor(
    Element.prototype,
    "getBoundingClientRect"
  );
  const originalClientHeight = Object.getOwnPropertyDescriptor(
    HTMLElement.prototype,
    "clientHeight"
  );

  /** Mocks a section element's vertical position to simulate scroll state. */
  function setSectionTop(element: Element, top: number): void {
    Object.defineProperty(element, "getBoundingClientRect", {
      configurable: true,
      value: () => ({ top, height: 100, bottom: top + 100, left: 0, right: 800, width: 800, x: 0, y: top, toJSON() {} })
    });
  }

  return {
    scrollIntoView,
    /** Installs fresh mocks before each test. */
    install(): void {
      scrollIntoView.mockClear();
      Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
        configurable: true,
        value: scrollIntoView
      });
      // happy-dom has no layout engine; give the scroll container a realistic
      // clientHeight so the threshold computation (top + clientHeight * 0.2)
      // produces a sensible value.
      Object.defineProperty(HTMLElement.prototype, "clientHeight", {
        configurable: true,
        get() {
          return this.getAttribute("data-testid") === "settings-content-scroll" ? 500 : 0;
        }
      });
      // Default: all elements render below the threshold so no section is
      // active on mount. `intersect` repositions specific sections above it.
      // The scroll container itself is positioned at top:0 with a realistic
      // height so the threshold line (20% down) sits at y=100.
      Object.defineProperty(Element.prototype, "getBoundingClientRect", {
        configurable: true,
        value: function () {
          if (this instanceof HTMLElement && this.getAttribute("data-testid") === "settings-content-scroll") {
            return { top: 0, height: 500, bottom: 500, left: 0, right: 800, width: 800, x: 0, y: 0, toJSON() {} };
          }
          return { top: 1000, height: 100, bottom: 1100, left: 0, right: 800, width: 800, x: 0, y: 1000, toJSON() {} };
        }
      });
    },
    /** Restores happy-dom globals after each test. */
    restore(): void {
      if (originalScrollDescriptor) {
        Object.defineProperty(
          HTMLElement.prototype,
          "scrollIntoView",
          originalScrollDescriptor
        );
      } else {
        Reflect.deleteProperty(HTMLElement.prototype, "scrollIntoView");
      }
      if (originalGetBoundingClientRect) {
        Object.defineProperty(
          Element.prototype,
          "getBoundingClientRect",
          originalGetBoundingClientRect
        );
      } else {
        Reflect.deleteProperty(Element.prototype, "getBoundingClientRect");
      }
      if (originalClientHeight) {
        Object.defineProperty(
          HTMLElement.prototype,
          "clientHeight",
          originalClientHeight
        );
      } else {
        Reflect.deleteProperty(HTMLElement.prototype, "clientHeight");
      }
    },
    /**
     * Positions the target section and all preceding sections at the top of
     * the scroll container (above the threshold) and all following sections
     * below it, then dispatches a scroll event to trigger recompute.
     */
    intersect(section: Element): void {
      const all = Array.from(
        document.querySelectorAll('section[id^="settings-section-"]')
      );
      const index = all.indexOf(section);
      for (let i = 0; i < all.length; i++) {
        const el = all[i];
        if (el) setSectionTop(el, i <= index ? 0 : 1000);
      }
      const container = document.querySelector('[data-testid="settings-content-scroll"]');
      container?.dispatchEvent(new Event("scroll", { bubbles: false }));
    }
  };
}
