import { expect, test } from "@playwright/test";

/*
 * Shell and Stage 01 screens against `next dev` with the Access dev bypass
 * (apps/web/.dev.vars: ACCESS_DEV_BYPASS_EMAIL). Content-dependent checks
 * accept the empty state so the suite passes before `hivemind content publish`.
 */

test("control center renders inside the canonical shell", async ({ page }) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Control Center", level: 1 }),
  ).toBeVisible();
  const nav = page.getByRole("navigation", { name: "Primary" });
  await expect(nav).toContainText("CORE");
  await expect(nav).toContainText("INTELLIGENCE");
  await expect(nav).toContainText("SYSTEM");
  await expect(page.getByTestId("pane-environment")).toContainText("d1");
  await expect(page.getByTestId("pane-work-orders")).toBeVisible();
  await expect(page.getByTestId("lab-host-widget")).toBeVisible();
});

test("api/me returns the seeded learner bound to the dev identity", async ({
  request,
}) => {
  const response = await request.get("/api/me");
  expect(response.status()).toBe(200);
  const body = (await response.json()) as { id: string; identity: { provider: string } };
  expect(body.id).toBe("HM-LRN-000001");
  expect(body.identity.provider).toBe("cloudflare_access");
});

test("courses page lists published content or its empty state", async ({ page }) => {
  await page.goto("/courses");
  await expect(page.getByRole("heading", { name: "Courses", level: 1 })).toBeVisible();
  const empty = page.getByText("no published content");
  const firstCourse = page.locator("table.hm-table tbody tr").first().getByRole("link");
  await expect(empty.or(firstCourse)).toBeVisible();
  if (await empty.isVisible()) {
    await expect(empty).toContainText("hivemind content publish");
  } else {
    await firstCourse.first().click();
    await expect(page.locator("article.hm-lesson")).toBeVisible();
    await expect(page.locator("article.hm-lesson section[data-element]")).toHaveCount(12);
  }
});

test("work orders screen opens the panel with n and creates an order", async ({
  page,
}) => {
  await page.goto("/work-orders");
  await expect(
    page.getByRole("heading", { name: "Claude Work Orders", level: 1 }),
  ).toBeVisible();
  await page.waitForLoadState("networkidle");
  await page.keyboard.press("n");
  const panel = page.getByTestId("work-order-panel");
  await expect(panel).toBeVisible();
  await panel.getByRole("combobox").first().selectOption("platform.feature");
  await panel.getByPlaceholder("area, e.g. settings").fill("e2e-smoke");
  await panel
    .getByPlaceholder("What should Claude Code do? Included verbatim in the prompt.")
    .fill("Smoke test order.");
  await panel.getByRole("button", { name: "create" }).click();
  const detail = page.getByTestId("work-order-detail");
  await expect(detail).toBeVisible();
  await expect(detail).toContainText("HM-WO-");
  await expect(detail).toContainText("draft");
  await detail.getByRole("tab", { name: "Prompt" }).click();
  await expect(detail).toContainText("Execute HiveMind Work Order");
  await expect(detail).toContainText("Smoke test order.");
});

test("settings shows identity and export status", async ({ page }) => {
  await page.goto("/settings");
  await expect(page.getByTestId("pane-identity")).toContainText("HM-LRN-000001");
  await expect(page.getByTestId("pane-data")).toContainText("last D1 export");
  await expect(page.getByTestId("pane-ai")).toContainText("external");
});

test("infrastructure console renders the overview and the workers empty state", async ({
  page,
}) => {
  await page.goto("/system/infrastructure");
  await expect(
    page.getByRole("heading", { name: "Infrastructure", level: 1 }),
  ).toBeVisible();
  await expect(page.getByTestId("pane-overview")).toContainText("workers online");
  await expect(page.getByRole("tab", { name: "Images & Runtimes" })).toBeVisible();
  await page.getByRole("tab", { name: "Images & Runtimes" }).click();
  await expect(page.getByTestId("table-runtimes")).toContainText("frr");
  await expect(page.getByTestId("table-runtimes")).toContainText("@sha256:");
  const response = await page.request.get("/api/infrastructure");
  expect(response.status()).toBe(200);
  const body = (await response.json()) as { runtimes: { name: string }[] };
  expect(body.runtimes.some((row) => row.name === "linux-lab")).toBe(true);
});
