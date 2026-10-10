import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./e2e", timeout: 180000, expect: { timeout: 60000 }, workers: 1,
  use: { baseURL: "http://127.0.0.1:5174", viewport: { width: 1366, height: 768 }, reducedMotion: "reduce", screenshot: "only-on-failure", trace: "off", actionTimeout: 10000 },
  reporter: [["list"]],
});
