import { expect, test } from "@playwright/test";

test("desktop workspace shell boots in the browser harness", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "Thinkbrain Notes" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Workspace" })).toBeVisible();
  await expect(page.getByText("Open a folder to list and manage Markdown notes.")).toBeVisible();
});
