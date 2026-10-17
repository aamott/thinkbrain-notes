import { expect, test, type Page } from "@playwright/test";

import { expectNoNativeFailures, installHistoryVault, settledEditorSpot } from "./locationHistoryHarness";

/**
 * Same-note heading links — desktop chrome.
 *
 * A `#fragment` link is an in-file jump: it never loads a document and never
 * opens another surface, but it records a real history visit so Back returns
 * to the parked spot and Forward returns to the heading. Resolution reads
 * the live editor document, so unsaved headings resolve the moment they are
 * typed. A missing fragment warns through the status-bar toast instead of
 * moving.
 *
 * Desktop-project spec (filename convention in `playwright.config.ts`).
 */

const ARTIFACTS = "/tmp/heading-links-artifacts";

/**
 * One document: a parked-caret line, a link line carrying a Markdown anchor,
 * an aliased wiki heading, an encoded duplicate, and a dead-end target —
 * then three far headings past enough filler to force a real scroll. The
 * duplicated "## Deep Section" gets id `deep-section-1`, the target the
 * encoded link points at; its unique body line proves which heading landed.
 */
const HEADING_VAULT_DOCS: Record<string, string> = {
  "guide.md": [
    "# Guide",
    "",
    "guide parked line",
    "",
    "jump [Deep](#deep-section) or [[#Far Target|wiki far]] or [Encoded](#deep%20section-1) or [Nope](#missing-one)",
    "",
    ...Array.from({ length: 40 }, (_, i) => `filler ${i + 1}`),
    "## Deep Section",
    "deep body",
    ...Array.from({ length: 12 }, (_, i) => `gap ${i + 1}`),
    "## Far Target",
    "far body",
    ...Array.from({ length: 8 }, (_, i) => `post-far ${i + 1}`),
    "## Deep Section",
    "deep body two"
  ].join("\n")
};

const editor = (page: Page) => page.locator(".cm-content");
const backButton = (page: Page) => page.getByRole("button", { name: "Back", exact: true });
const forwardButton = (page: Page) => page.getByRole("button", { name: "Forward", exact: true });
const strip = (page: Page) => page.locator("[data-tab-id]");
const spot = async (page: Page) => (await settledEditorSpot(page)).selectionLine;

/** Parks the caret on the marker line so Back evidence is a real selection. */
async function openGuide(page: Page) {
  await installHistoryVault(page, HEADING_VAULT_DOCS);
  await page.goto("/");
  await page.getByRole("button", { name: "Open guide.md" }).click();
  await expect(editor(page).getByText(/Guide/)).toBeVisible();
  await editor(page).getByText("guide parked line", { exact: true }).click();
  expect(await spot(page)).toBe("guide parked line");
}

test("a Markdown anchor link jumps in place — Back and Forward walk the visit", async ({
  page
}) => {
  await openGuide(page);
  const parked = await settledEditorSpot(page);

  await page.locator(".cm-link-resolved", { hasText: "Deep" }).click();
  expect(await spot(page)).toBe("## Deep Section");
  await expect(strip(page)).toHaveCount(1);
  await page.screenshot({ path: `${ARTIFACTS}/desktop-01-heading-jump.png` });

  await backButton(page).click();
  const restored = await settledEditorSpot(page);
  expect(restored.selectionLine).toBe("guide parked line");
  expect(restored.selectionOffset).toBe(parked.selectionOffset);
  expect(restored.firstLine).toBe(parked.firstLine);
  expect(Math.abs(restored.scrollTop - parked.scrollTop)).toBeLessThanOrEqual(2);

  await forwardButton(page).click();
  expect(await spot(page)).toBe("## Deep Section");
  await expect(strip(page)).toHaveCount(1);
  await expectNoNativeFailures(page);
});

test("a wiki heading link and an encoded duplicate resolve to their headings", async ({
  page
}) => {
  await openGuide(page);

  // `[[#Far Target|wiki far]]` — the wiki target itself is the fragment.
  await page.locator(".cm-link-resolved", { hasText: "wiki far" }).click();
  expect(await spot(page)).toBe("## Far Target");

  await backButton(page).click();
  expect(await spot(page)).toBe("guide parked line");

  // An encoded fragment decodes once into the duplicated heading's id:
  // `deep%20section-1` → `deep-section-1` — the SECOND "## Deep Section",
  // proven by its unique following body line, not the heading text itself.
  await page.locator(".cm-link-resolved", { hasText: "Encoded" }).click();
  const landed = await settledEditorSpot(page);
  expect(landed.selectionLine).toBe("## Deep Section");
  expect(landed.visibleLines).toContain("deep body two");
  await expect(strip(page)).toHaveCount(1);
  await expectNoNativeFailures(page);
});

test("a missing heading warns through the toast and leaves everything parked", async ({
  page
}) => {
  await openGuide(page);
  const parked = await settledEditorSpot(page);

  await page.locator(".cm-link-resolved", { hasText: "Nope" }).click();

  const toast = page.locator('aside[role="alert"]');
  await expect(toast).toBeVisible();
  await expect(toast).toContainText("Heading not found");
  await expect(toast).toContainText('"missing-one"');
  // No jump, no visit: the caret and the Forward button never moved.
  const spot_ = await settledEditorSpot(page);
  expect(spot_.selectionLine).toBe(parked.selectionLine);
  expect(spot_.selectionOffset).toBe(parked.selectionOffset);
  await expect(forwardButton(page)).toBeDisabled();
  await expect(strip(page)).toHaveCount(1);
  await page.screenshot({ path: `${ARTIFACTS}/desktop-02-missing-heading.png` });

  // Dismiss the warning first, then the native-failure sweep still runs —
  // the alert is expected content, not a reason to skip the check.
  await toast.getByRole("button", { name: "Dismiss", exact: true }).click();
  await expect(toast).toHaveCount(0);
  await expectNoNativeFailures(page);
});

test("a heading typed but not yet saved resolves, and Ctrl+Z still undoes", async ({ page }) => {
  await installHistoryVault(page, {
    "guide.md": [
      "# Guide",
      "",
      "guide parked line",
      "",
      "jump [Fresh](#fresh-heading)",
      "",
      ...Array.from({ length: 30 }, (_, i) => `filler ${i + 1}`),
      "tail line"
    ].join("\n")
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Open guide.md" }).click();
  await expect(editor(page).getByText(/Guide/)).toBeVisible();

  // Type the heading at the tail — dirty, unsaved, but the live document is
  // what the fragment resolves against. The tail line itself sits below the
  // rendered window, so park visibly and let Ctrl+End carry the caret down.
  await editor(page).getByText("filler 5", { exact: true }).click();
  await page.keyboard.press("Control+End");
  await page.keyboard.type("\n\n## Fresh Heading");
  await editor(page).getByText("guide parked line", { exact: true }).click();

  await page.locator(".cm-link-resolved", { hasText: "Fresh" }).click();
  expect(await spot(page)).toBe("## Fresh Heading");
  // The in-file jump never saved: the tab still carries its dirty dot.
  await expect(
    page.locator('[data-tab-id] [aria-label="Unsaved changes"]')
  ).toBeVisible();

  // The jump's own undo visit stays intact — the in-file history untouched.
  await page.keyboard.press("Control+z");
  await expect(editor(page).getByText("## Fresh Heading")).toHaveCount(0);
  await backButton(page).click();
  expect(await spot(page)).toBe("guide parked line");
});

test("source mode: Mod+Enter on a heading link follows it", async ({ page }) => {
  await openGuide(page);

  await page.keyboard.press("Control+p");
  const palette = page.getByRole("dialog", { name: "Command palette" });
  await palette.getByRole("combobox", { name: "Search commands" }).fill("Toggle live preview");
  await page.keyboard.press("Enter");
  await expect(palette).not.toBeVisible();
  await expect(page.locator(".cm-link-resolved")).toHaveCount(0);

  // Plain click parks the caret inside the raw anchor syntax, then Mod+Enter.
  const line = page.locator(".cm-line", { hasText: "wiki far" });
  const box = (await line.boundingBox())!;
  await line.click({ position: { x: 60, y: box.height / 2 } });
  await page.keyboard.press("Control+Enter");

  expect(await spot(page)).toBe("## Deep Section");
  await expect(strip(page)).toHaveCount(1);
  await expectNoNativeFailures(page);
});
