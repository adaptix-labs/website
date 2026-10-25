import path from "node:path";
import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";

export default defineConfig(async () => {
  const migrations = await readD1Migrations(path.join(__dirname, "migrations"));
  return {
    test: {
      setupFiles: ["./test/setup.ts"],
    },
    plugins: [
      cloudflareTest({
        wrangler: { configPath: "./wrangler.jsonc" },
        miniflare: {
          bindings: {
            TEST_MIGRATIONS: migrations,
            TURNSTILE_SECRET: "test-turnstile-secret",
            RESEND_API_KEY: "test-resend-key",
            IP_HASH_SALT: "test-salt",
          },
        },
      }),
    ],
  };
});
