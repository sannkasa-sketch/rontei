import { defineConfig, devices } from "@playwright/test";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseEnv } from "node:util";

const testEnvPath = resolve(process.cwd(), ".env.test.local");
if (existsSync(testEnvPath)) {
  const testEnvironment = parseEnv(readFileSync(testEnvPath, "utf8"));
  for (const [key, value] of Object.entries(testEnvironment)) process.env[key] = value;
}

// Browser tests use a local deterministic widget instead of an external Cloudflare challenge.
process.env.NEXT_PUBLIC_TURNSTILE_TEST_MODE = "true";

const e2eBaseUrl = "http://localhost:3100";

export default defineConfig({
  testDir: "./tests/e2e",
  // Most authenticated scenarios share the two dedicated Supabase test users.
  // Run sequentially to avoid concurrent password sign-ins being rate-limited.
  workers: 1,
  use: {
    baseURL: e2eBaseUrl,
    timezoneId: "Asia/Tokyo",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: "npm run dev -- --port 3100",
    url: e2eBaseUrl,
    env: {
      NEXT_DIST_DIR: ".next/e2e",
      NEXT_PUBLIC_TURNSTILE_TEST_MODE: "true",
    },
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
