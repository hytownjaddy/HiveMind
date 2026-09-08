import { expect, test } from "@playwright/test";

test("dashboard renders inside the app shell", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Primary" })).toBeVisible();
});

test("launches a lab session and reaches a live terminal", async ({ page }) => {
  await page.goto("/labs");
  await page.getByRole("button", { name: "Launch lab" }).click();
  await expect(page).toHaveURL(/\/labs\/[0-9a-f-]{36}$/u);
  await expect(page.getByTestId("connection-status")).toHaveText(/online/u, {
    timeout: 15_000,
  });
  await expect(page.getByTestId("lab-status")).toHaveText(/ready|active/u, {
    timeout: 15_000,
  });
  await page.locator(".xterm").click();
  await page.keyboard.type("status");
  await page.keyboard.press("Enter");
  await expect(page.locator(".xterm")).toContainText("echo provider: healthy", {
    timeout: 10_000,
  });
  await page.getByRole("button", { name: "Destroy" }).click();
  await expect(page.getByTestId("lab-status")).toHaveText("destroyed", {
    timeout: 10_000,
  });
});
