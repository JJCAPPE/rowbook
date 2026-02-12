import { expect, test } from "@playwright/test";

import { disconnectE2ESeed, ensureE2ESeedData } from "./seed";

const enabled = process.env.E2E_ENABLED === "1";

test.describe("@smoke coach review queue", () => {
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

  test("coach can review a pending entry", async ({ page }) => {
    await page.goto("/coach/review");

    await expect(page.getByText("Review queue")).toBeVisible();
    await expect(page.getByRole("button", { name: "Mark verified" }).first()).toBeVisible();

    await page.getByRole("button", { name: "Mark verified" }).first().click();
    await expect(page.getByText("Reviewed successfully")).toBeVisible();
  });
});
