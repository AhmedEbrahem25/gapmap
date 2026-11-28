import { defineConfig } from "@playwright/test";

/**
 * Submission screenshots + captioned walkthrough video: npx playwright test --config capture/capture.config.ts
 * Runs the production build (npm run build first) on a fresh database, fully offline (no AI keys).
 * VIEW=phone re-runs the flow at phone size and saves only the student screens.
 */
const PORT = Number(process.env.CAPTURE_PORT ?? 3500);

export default defineConfig({
  testDir: ".",
  testMatch: "capture.spec.ts",
  timeout: 15 * 60_000,
  expect: { timeout: 20_000 },
  workers: 1,
  reporter: [["list"]],
  outputDir: "../test-results/capture",
  use: {
    baseURL: `http://localhost:${PORT}`,
    channel: process.env.PW_CHANNEL ?? "msedge",
    headless: true,
    actionTimeout: 15_000,
    navigationTimeout: 45_000,
  },
  webServer: {
    command: `npx next start -p ${PORT}`,
    cwd: "..",
    url: `http://localhost:${PORT}/login`,
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      DATABASE_PATH: "data/capture.db",
      DEMO_MODE: "true",
      ANTHROPIC_API_KEY: "",
      GEMINI_API_KEY: "",
      COOKIE_SECURE: "false",
      SESSION_SECRET: "capture-only-secret-capture-only-secret-0123456789",
    },
  },
  globalSetup: "./capture.setup.ts",
});
