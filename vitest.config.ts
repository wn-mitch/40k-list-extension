import { defineConfig } from "vitest/config";

// Two projects: plain-node unit tests, and the worker route tests which run
// inside workerd (real D1 + R2 bindings) via @cloudflare/vitest-pool-workers.
export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: "node",
          include: ["packages/**/*.{test,spec}.ts"],
          exclude: ["**/node_modules/**", "packages/worker/test/routes.test.ts"],
        },
      },
      "packages/worker/vitest.config.ts",
    ],
  },
});
