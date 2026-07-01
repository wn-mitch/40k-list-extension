// Applies the real ../../migrations/*.sql to the isolated test D1 before each
// test file, so route tests exercise the exact production schema.
import { applyD1Migrations, env } from "cloudflare:test";

await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
