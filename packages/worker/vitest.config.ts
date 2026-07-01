import { fileURLToPath } from "node:url";
import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";

// Route tests run inside workerd with real (local, isolated) D1 + R2 bindings.
// Bindings are declared here directly instead of via wrangler.jsonc so tests
// don't depend on the production database id or the built SPA assets dir; env
// vars (DEV_ALLOW_ALL, quotas, ...) are supplied per-test in routes.test.ts.
export default defineConfig(async () => {
  const migrations = await readD1Migrations(
    fileURLToPath(new URL("../../migrations", import.meta.url)),
  );
  return {
    plugins: [
      cloudflareTest({
        miniflare: {
          compatibilityDate: "2026-06-01",
          d1Databases: ["DB"],
          r2Buckets: ["RAW"],
          // Test-only binding so the setup file can apply the real migrations.
          bindings: { TEST_MIGRATIONS: migrations },
        },
      }),
    ],
    test: {
      name: "worker-routes",
      include: ["test/routes.test.ts"],
      setupFiles: ["./test/apply-migrations.ts"],
    },
  };
});
