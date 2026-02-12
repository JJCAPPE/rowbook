import path from "node:path";
import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const resolveAlias = [
  {
    find: /^@\/(.*)$/,
    replacement: path.resolve(__dirname, "apps/web/src/$1"),
  },
  {
    find: "@rowbook/shared",
    replacement: path.resolve(__dirname, "packages/shared/src/index.ts"),
  },
  {
    find: "server-only",
    replacement: path.resolve(__dirname, "tests/setup/server-only.ts"),
  },
];

export default defineConfig({
  resolve: {
    alias: resolveAlias,
  },
  esbuild: {
    jsxInject: 'import React from "react"',
  },
  test: {
    globals: true,
    reporters: ["default"],
    exclude: [
      "**/node_modules/**",
      "**/dist/**",
      "**/coverage/**",
      "tests/e2e/**",
      "scripts/manual/**",
    ],
    projects: [
      {
        extends: true,
        test: {
          name: "unit-node",
          environment: "node",
          include: ["tests/unit/**/*.test.ts"],
          setupFiles: ["tests/setup/vitest.node.setup.ts"],
        },
      },
      {
        extends: true,
        test: {
          name: "component-jsdom",
          environment: "jsdom",
          pool: "forks",
          include: ["tests/component/**/*.test.ts", "tests/component/**/*.test.tsx"],
          setupFiles: ["tests/setup/vitest.dom.setup.ts"],
        },
      },
      {
        extends: true,
        test: {
          name: "integration-db",
          environment: "node",
          include: ["tests/integration/**/*.test.ts"],
          setupFiles: ["tests/setup/vitest.node.setup.ts", "tests/setup/postgres.ts"],
          fileParallelism: false,
          testTimeout: 60000,
          hookTimeout: 120000,
        },
      },
    ],
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      reportsDirectory: "./coverage",
    },
  },
});
