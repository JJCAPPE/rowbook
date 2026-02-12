import { expect, test } from "@playwright/test";

import { disconnectE2ESeed, ensureE2ESeedData } from "./seed";

const enabled = process.env.E2E_ENABLED === "1";

test.describe("@smoke coach overview", () => {
  test.skip(!enabled, "E2E_ENABLED=1 required to run browser smoke tests.");

  test.use({
    extraHTTPHeaders: {
      "x-rowbook-test-email": "coach@test.local",
    },
  });

  test.beforeAll(async () => {
    await ensureE2ESeedData();
  });

  test.afterAll(async () => {
    await disconnectE2ESeed();
  });

  test("coach can view overview stats and leaderboard", async ({ page }) => {
    await page.goto("/coach");

    await expect(page.getByText("Team overview")).toBeVisible();
    await expect(page.getByText("Met goal")).toBeVisible();
    await expect(page.getByText("Not met")).toBeVisible();

    await expect(page.getByRole("button", { name: "Hide exempt" })).toBeVisible();
  });
});
