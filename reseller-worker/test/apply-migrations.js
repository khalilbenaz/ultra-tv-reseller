import { applyD1Migrations, env } from "cloudflare:test";

await applyD1Migrations(env.RESELLER, env.TEST_MIGRATIONS);
