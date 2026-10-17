import { expect, test, type Page } from "@playwright/test";

import { expectNoNativeFailures, installHistoryVault, settledEditorSpot } from "./locationHistoryHarness";

/**
 * Same-note heading links — phone chrome.
 *
 * Runs only under the `phone` project. Same contract as the desktop spec:
 * a `#fragment` tap jumps the live editor in place and records a visit the
 * header Back/Forward walk. The phone has no status bar, so a missing
 * fragment warns through the floating dismissible banner instead.
 */

const ARTIFACTS = "/tmp/heading-links-artifacts";

const HEADING_VAULT_DOCS: Record<string, string> = {
  "guide.md": [
    "# Guide",
    "",
    "jump [Deep](#deep-section) or [[#Far Target|wiki far]] or [Nope](#missing-one)",
    "",
    ...Array.from({ length: 60 }, (_, i) => `filler ${i + 1}`),
    "## Deep Section",
    "deep body",
    ...Array.from({ length: 10 }, (_, i) => `gap ${i + 1}`),
    "## Far Target",
    "far body"
  ].join("\n")
};

const editor = (page: Page) => page.locator(".cm-content");
const backButton = (page: Page) => page.locator('header [aria-label="Back"]');
const forwardButton = (page: Page) => page.locator('header [aria-label="Forward"]');
const banner = (page: Page) => page.locator('aside[role="alert"]');
const spot = async (page: Page) => (await settledEditorSpot(page)).selectionLine;

async function openGuide(page: Page) {
  await installHistoryVault(page, HEADING_VAULT_DOCS);
  await page.goto("/");
  await page.getByRole("button", { name: "Open guide.md" }).tap();
  await expect(editor(page).getByText(/Guide/)).toBeVisible();
}

test("tapping a Markdown anchor link jumps in place; Back and Forward walk it", async ({
  page
}) => {
  await openGuide(page);
  // Park on a filler line near enough that the link line stays rendered —
  // the returned-to selection is the evidence the departure was captured.
  await editor(page).getByText("filler 8", { exact: true }).tap();
  const parked = await settledEditorSpot(page);
  expect(parked.selectionLine).toBe("filler 8");

  await page.locator(".cm-link-resolved", { hasText: "Deep" }).tap();
  expect(await spot(page)).toBe("## Deep Section");
  await page.screenshot({ path: `${ARTIFACTS}/phone-01-heading-jump.png` });

  await backButton(page).tap();
  // The restore lands a beat after the route pop — poll past the settle.
  await expect.poll(async () => (await settledEditorSpot(page)).selectionLine).toBe("filler 8");
  const restored = await settledEditorSpot(page);
  expect(restored.firstLine).toBe(parked.firstLine);
  expect(Math.abs(restored.scrollTop - parked.scrollTop)).toBeLessThanOrEqual(2);
  await forwardButton(page).tap();
  await expect.poll(() => spot(page)).toBe("## Deep Section");
  await expectNoNativeFailures(page);
});

test("tapping a wiki heading link jumps in place", async ({ page }) => {
  await openGuide(page);
  await editor(page).getByText("filler 8", { exact: true }).tap();
  expect(await spot(page)).toBe("filler 8");

  await page.locator(".cm-link-resolved", { hasText: "wiki far" }).tap();
  expect(await spot(page)).toBe("## Far Target");

  await backButton(page).tap();
  await expect.poll(() => spot(page)).toBe("filler 8");
  await expectNoNativeFailures(page);
});

test("a missing heading shows the dismissible warning banner and records nothing", async ({
  page
}) => {
  await openGuide(page);
  await editor(page).getByText("filler 8", { exact: true }).tap();
  const parked = await settledEditorSpot(page);
  expect(parked.selectionLine).toBe("filler 8");

  await page.locator(".cm-link-resolved", { hasText: "Nope" }).tap();

  // The floating banner — not a route, not a sheet — reports the miss.
  await expect(banner(page)).toBeVisible();
  await expect(banner(page)).toContainText("Heading not found");
  await expect(banner(page)).toContainText('"missing-one"');
  await page.screenshot({ path: `${ARTIFACTS}/phone-02-missing-heading.png` });

  // Nothing was recorded and the concealed tap never planted a caret: the
  // parked selection, offset and viewport all survive untouched.
  await expect(forwardButton(page)).toBeDisabled();
  const after = await settledEditorSpot(page);
  expect(after.selectionLine).toBe(parked.selectionLine);
  expect(after.selectionOffset).toBe(parked.selectionOffset);
  expect(after.scrollTop).toBe(parked.scrollTop);

  // Dismiss clears it without disturbing the note.
  await banner(page).getByLabel("Dismiss navigation warning").tap();
  await expect(banner(page)).toHaveCount(0);
  const dismissed = await settledEditorSpot(page);
  expect(dismissed.selectionLine).toBe(parked.selectionLine);
  expect(dismissed.scrollTop).toBe(parked.scrollTop);
  await expectNoNativeFailures(page);
});

test("a heading typed but unsaved resolves on tap", async ({ page }) => {
  await installHistoryVault(page, {
    "guide.md": [
      "# Guide",
      "",
      "jump [Fresh](#fresh-heading)",
      "",
      ...Array.from({ length: 40 }, (_, i) => `filler ${i + 1}`),
      "tail line"
    ].join("\n")
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Open guide.md" }).tap();
  await expect(editor(page).getByText(/Guide/)).toBeVisible();

  // Type the heading into the live document — no save required. The Enters
  // split the parked line wherever the tap's caret lands, so the heading
  // always ends up on its own line; the departure tap below targets a
  // different line the insert can never touch.
  await editor(page).getByText("filler 8", { exact: true }).tap();
  // The touch caret focuses the editor a beat after the tap resolves, and
  // Enter keydowns don't reliably split lines under touch emulation —
  // `insertText` goes through the input path and inserts real newlines.
  await expect(page.locator(".cm-editor")).toHaveClass(/cm-focused/);
  await page.keyboard.insertText("\n\n## Fresh Heading");
  await expect(editor(page).getByText("## Fresh Heading")).toBeVisible();
  await editor(page).getByText("filler 4", { exact: true }).tap();

  await page.locator(".cm-link-resolved", { hasText: "Fresh" }).tap();
  await expect.poll(() => spot(page)).toBe("## Fresh Heading");
  await expectNoNativeFailures(page);
});
