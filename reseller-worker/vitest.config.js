import path from "node:path";
import { defineConfig } from "vitest/config";
import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-pool-workers";

// Clé Ed25519 de TEST uniquement (jamais utilisée en production ; la vraie est un secret Wrangler).
const TEST_SIGNING_KEY = "MC4CAQAwBQYDK2VwBCIEIEluBe28iIXEaB3g+PkZ3Pvq9z5Pu1lcFZlRlEPb8b+U";
export const TEST_PUBLIC_KEY = "MCowBQYDK2VwAyEAXS0xyk5w88oK9OgSRMHSZkRxnjIot3x8A8WVdl2axOU=";

export default defineConfig(async () => {
  const migrations = await readD1Migrations(path.join(import.meta.dirname, "migrations"));
  return {
    plugins: [
      cloudflareTest({
        wrangler: { configPath: "./wrangler.toml" },
        miniflare: { bindings: { LICENSE_SIGNING_KEY: TEST_SIGNING_KEY, SESSION_SECRET: "test-session-secret-0123456789abcdef0123456789", PROVIDER_ENC_KEY: "AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8=", TEST_PUBLIC_KEY, TEST_MIGRATIONS: migrations } },
      }),
    ],
    test: { include: ["test/**/*.test.js"], setupFiles: ["./test/apply-migrations.js"], testTimeout: 30000 },
  };
});
