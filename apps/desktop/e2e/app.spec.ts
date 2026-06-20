import { expect, test } from "@playwright/test";

test("desktop workspace shell boots in the browser harness", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "Thinkbrain Notes" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Workspace" })).toBeVisible();
  await expect(page.getByText("Open a folder to list and manage Markdown notes.")).toBeVisible();
});

test("activity bar toggles between the explorer and search panels", async ({ page }) => {
  await page.goto("/");

  await page.getByRole("button", { name: "Search" }).click();

  await expect(page.getByRole("heading", { name: "Find notes" })).toBeVisible();
  await expect(page.getByRole("searchbox", { name: "Search notes" })).toBeVisible();
  await expect(page.getByText("Open a folder to search your notes.")).toBeVisible();

  await page.getByRole("button", { name: "Explorer" }).click();
  await expect(page.getByRole("heading", { name: "Workspace" })).toBeVisible();
});
