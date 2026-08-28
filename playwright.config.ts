import { defineConfig, devices } from "@playwright/test";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseEnv } from "node:util";

const testEnvPath = resolve(process.cwd(), ".env.test.local");
if (existsSync(testEnvPath)) {
  const testEnvironment = parseEnv(readFileSync(testEnvPath, "utf8"));
  for (const [key, value] of Object.entries(testEnvironment)) process.env[key] = value;
}

export default defineConfig({
  testDir: "./tests/e2e",
  // Most authenticated scenarios share the two dedicated Supabase test users.
  // Run sequentially to avoid concurrent password sign-ins being rate-limited.
  workers: 1,
  use: {
    baseURL: "http://localhost:3000",
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
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
