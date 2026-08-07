import { expect, test } from "@playwright/test";

/**
 * Covers the extension platform end to end: manifest-declared contributions
 * appear before any extension code runs, and touching one activates it.
 */

test("lists a built-in extension that has not started yet", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Extensions", exact: true }).click();

  const list = page.getByRole("list", { name: "Installed extensions" });
  await expect(list).toContainText("Note Stats");
  await expect(list).toContainText("Not started");
});

test("activates the extension when its panel is opened", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Extensions", exact: true }).click();
  await expect(page.getByRole("list", { name: "Installed extensions" })).toContainText("Not started");

  // The panel is contributed by the manifest, so it exists before activation.
  await page.getByRole("button", { name: "Note Stats", exact: true }).click();
  await expect(page.getByText("Open a Markdown note to see its statistics.")).toBeVisible();

  // The Extensions panel stays open throughout: it subscribes to status
  // changes, so it must flip to Active without being re-opened.
  await expect(page.getByRole("list", { name: "Installed extensions" })).toContainText("Active");
});
