import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000";

const extraHTTPHeaders =
  process.env.TEST_AUTH_BYPASS === "1" && process.env.PLAYWRIGHT_TEST_EMAIL
    ? {
        "x-rowbook-test-email": process.env.PLAYWRIGHT_TEST_EMAIL,
      }
    : undefined;

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : [["list"]],
  use: {
    baseURL,
    trace: "on-first-retry",
    extraHTTPHeaders,
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: process.env.PLAYWRIGHT_BASE_URL
    ? undefined
    : {
        command: "npm --workspace apps/web run dev -- --port 3000",
        url: baseURL,
        reuseExistingServer: !process.env.CI,
        timeout: 120000,
        env: {
          NODE_ENV: "test",
          TEST_AUTH_BYPASS: process.env.TEST_AUTH_BYPASS ?? "1",
          DATABASE_URL:
            process.env.DATABASE_URL
            ?? "postgresql://postgres:postgres@127.0.0.1:5432/rowbook_test?schema=public",
          DIRECT_URL:
            process.env.DIRECT_URL
            ?? "postgresql://postgres:postgres@127.0.0.1:5432/rowbook_test?schema=public",
          SUPABASE_URL: process.env.SUPABASE_URL ?? "https://example.supabase.co",
          SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY ?? "test-anon-key",
          SUPABASE_SERVICE_ROLE_KEY:
            process.env.SUPABASE_SERVICE_ROLE_KEY ?? "test-service-role-key",
          SUPABASE_STORAGE_BUCKET: process.env.SUPABASE_STORAGE_BUCKET ?? "proof-images",
          AUTH_SECRET: process.env.AUTH_SECRET ?? "test-auth-secret-with-minimum-length",
          CRON_SECRET: process.env.CRON_SECRET ?? "test-cron-secret",
        },
      },
});
