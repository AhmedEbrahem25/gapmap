import { defineConfig } from "@playwright/test";
import base from "./playwright.config";

/**
 * Records the demo flows slowly, as a backup for the pitch: npm run demo:video.
 * Traces (screenshots of every step) always work; set DEMO_VIDEO=1 for .webm videos after `npx playwright install ffmpeg`.
 */
export default defineConfig({
  ...base,
  timeout: 240_000,
  outputDir: "test-results/video",
  use: {
    ...base.use,
    viewport: { width: 1280, height: 800 },
    trace: "on",
    video: process.env.DEMO_VIDEO ? { mode: "on", size: { width: 1280, height: 800 } } : "off",
    launchOptions: { slowMo: 450 },
  },
});
