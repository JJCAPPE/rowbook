import { expect, test } from "@playwright/test";

import { disconnectE2ESeed, ensureE2ESeedData } from "./seed";

const enabled = process.env.E2E_ENABLED === "1";

test.describe("@smoke athlete flow", () => {
  test.skip(!enabled, "E2E_ENABLED=1 required to run browser smoke tests.");

  test.use({
    extraHTTPHeaders: {
      "x-rowbook-test-email": "athlete-a@test.local",
    },
  });

  test.beforeAll(async () => {
    await ensureE2ESeedData();
  });

  test.afterAll(async () => {
    await disconnectE2ESeed();
  });

  test("athlete can view dashboard, history and leaderboard", async ({ page }) => {
    await page.goto("/athlete");

    await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
    await expect(page.getByText("Recent entries")).toBeVisible();

    await page.goto("/athlete/history");
    await expect(page.getByRole("heading", { name: "Weekly history" })).toBeVisible();

    await page.goto("/athlete/leaderboard");
    await expect(page.getByRole("heading", { name: "Weekly leaderboard" })).toBeVisible();
  });
});
