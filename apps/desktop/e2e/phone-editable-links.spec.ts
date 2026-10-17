import { expect, test, type Page } from "@playwright/test";

import { expectNoNativeFailures, installHistoryVault, settledEditorSpot } from "./locationHistoryHarness";

/**
 * Editable-link interaction regressions — phone chrome.
 *
 * Runs only under the `phone` project (filename convention in
 * `playwright.config.ts`), so `pointer: coarse` + `hasTouch` are real:
 * taps arrive as `pointerType: "touch"` presses. The contract: a concealed
 * link follows on tap, while a touch drag — the scroll gesture — never
 * navigates. Touch presses deliberately keep native `mousedown` behaviour
 * so scrolling and long-press selection still work; cancellation lives in
 * the move/cancel legs.
 */

const ARTIFACTS = "/tmp/editable-links-artifacts";

const LINK_VAULT_DOCS: Record<string, string> = {
  "alpha.md": [
    "# Alpha Doc",
    "",
    "see [Open bravo](bravo.md) and [[Bravo|the wiki route]] now",
    "",
    ...Array.from({ length: 60 }, (_, i) => `alpha filler line ${i + 1}`)
  ].join("\n"),
  "bravo.md": ["# Bravo Doc", "", "bravo body line"].join("\n")
};

const editor = (page: Page) => page.locator(".cm-content");
const onAlpha = async (page: Page) => {
  await expect(editor(page).getByText(/Alpha Doc/)).toBeVisible();
  await expect(editor(page).getByText(/Bravo Doc/)).toHaveCount(0);
};

async function openAlpha(page: Page) {
  await installHistoryVault(page, LINK_VAULT_DOCS);
  await page.goto("/");
  await page.getByRole("button", { name: "Open alpha.md" }).tap();
  await expect(editor(page).getByText(/Alpha Doc/)).toBeVisible();
}

test("tapping a concealed Markdown link navigates", async ({ page }) => {
  await openAlpha(page);
  // Park the caret on a different filler line — near enough that
  // CodeMirror still renders the link (it virtualizes off-viewport lines),
  // far enough that Back returning *this* selection proves the departure
  // capture saved the pre-tap position, not wherever the tap landed.
  await editor(page).getByText("alpha filler line 10", { exact: true }).tap();
  const parked = await settledEditorSpot(page);
  expect(parked.selectionLine).toBe("alpha filler line 10");

  await editor(page).getByText("Open bravo", { exact: true }).tap();
  await expect(editor(page).getByText(/Bravo Doc/)).toBeVisible();
  await page.screenshot({ path: `${ARTIFACTS}/phone-01-tap-follow.png` });

  await page.locator('header [aria-label="Back"]').tap();
  await onAlpha(page);
  const restored = await settledEditorSpot(page);
  expect(restored.selectionLine).toBe("alpha filler line 10");
  await expectNoNativeFailures(page);
});

test("tapping a concealed wiki link navigates", async ({ page }) => {
  await openAlpha(page);
  await editor(page).getByText("the wiki route", { exact: true }).tap();
  await expect(editor(page).getByText(/Bravo Doc/)).toBeVisible();
  await expectNoNativeFailures(page);
});

test("a touch drag that scrolls never follows the link under the finger", async ({
  page
}) => {
  await openAlpha(page);
  const link = page.locator(".cm-link-resolved", { hasText: "Open bravo" });
  const box = (await link.boundingBox())!;
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;

  // A real touch drag through CDP: touchStart on the link, then moves that
  // scroll the scroller upward. The gesture must cancel — no click follows.
  const session = await page.context().newCDPSession(page);
  await session.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ x: cx, y: cy }]
  });
  for (let i = 1; i <= 8; i++) {
    await session.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{ x: cx, y: cy - i * 25 }]
    });
  }
  await session.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });

  await onAlpha(page);
  // Evidence the gesture was a real scroll, not an ignored input.
  const scrollTop = await page.locator(".cm-scroller").evaluate((el) => el.scrollTop);
  expect(scrollTop).toBeGreaterThan(0);
  await settledEditorSpot(page);
  await page.screenshot({ path: `${ARTIFACTS}/phone-02-scroll-no-follow.png` });
  await expectNoNativeFailures(page);
});
