import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { defineConfig, devices } from "@playwright/test";
import { E2E_LIV_PORT, E2E_TOKEN, E2E_VITE_PORT } from "./src/index";

const repoRoot = resolve(import.meta.dirname, "../..");
const isCI = Boolean(process.env.CI);

// Workers re-evaluate this file; the env var makes them reuse the main process's data dir.
process.env.LIV_E2E_DATA_DIR ??= mkdtempSync(join(tmpdir(), "liv-e2e-"));
const dataDir = process.env.LIV_E2E_DATA_DIR;

// Second, unseeded Liv + Vite pair for the minimal-first spec: a fresh install with no farm data.
process.env.LIV_E2E_FRESH_DATA_DIR ??= mkdtempSync(join(tmpdir(), "liv-e2e-fresh-"));
const freshDataDir = process.env.LIV_E2E_FRESH_DATA_DIR;
const FRESH_LIV_PORT = E2E_LIV_PORT + 1;
const FRESH_VITE_PORT = E2E_VITE_PORT + 1;
const FRESH_TOKEN = "e2e-fresh";
const FRESH_SPEC = /minimal-first\.spec\.ts/;

// The seeded farm's browser has seen the tour of Home, on the app's origin and on the origin of
// the farm's own build. The fresh-install spec starts without it and walks the tour.
const tourSeen = {
  cookies: [],
  origins: [E2E_VITE_PORT, E2E_LIV_PORT].map((port) => ({
    origin: `http://127.0.0.1:${port}`,
    localStorage: [{ name: "liv.tour", value: "seen" }],
  })),
};

export default defineConfig({
  testDir: "./web",
  // One Liv instance and one data dir are shared, so specs run one at a time.
  fullyParallel: false,
  workers: 1,
  forbidOnly: isCI,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  reporter: isCI
    ? [["list"], ["html", { open: "never" }], ["junit", { outputFile: "test-results/junit.xml" }]]
    : [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: `http://127.0.0.1:${E2E_VITE_PORT}`,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      testIgnore: FRESH_SPEC,
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1280, height: 800 },
        storageState: tourSeen,
      },
    },
    {
      name: "fresh",
      testMatch: FRESH_SPEC,
      use: {
        ...devices["Desktop Chrome"],
        baseURL: `http://127.0.0.1:${FRESH_VITE_PORT}`,
        viewport: { width: 1280, height: 820 },
      },
    },
  ],
  webServer: [
    {
      name: "liv",
      command: `bun packages/liv/src/main.ts --port ${E2E_LIV_PORT} --token ${E2E_TOKEN} --mock-model --seed --data-dir "${dataDir}" --app-source "${repoRoot}"`,
      cwd: repoRoot,
      url: `http://127.0.0.1:${E2E_LIV_PORT}/health`,
      reuseExistingServer: false,
      timeout: 60_000,
      stdout: "pipe",
      stderr: "pipe",
      env: {
        LIV_SECRETS: "file",
        LIV_MOCK_DELAY_MS: "5",
        LIV_FAKE_CAMERAS: "[]",
      },
    },
    {
      name: "vite",
      command: `bunx vite --host 127.0.0.1 --port ${E2E_VITE_PORT} --strictPort`,
      cwd: join(repoRoot, "apps/liv"),
      url: `http://127.0.0.1:${E2E_VITE_PORT}`,
      reuseExistingServer: false,
      timeout: 120_000,
      stdout: "pipe",
      stderr: "pipe",
      env: {
        VITE_LIV_URL: `ws://127.0.0.1:${E2E_LIV_PORT}/ws`,
        VITE_LIV_TOKEN: E2E_TOKEN,
        VITE_LOCAL_UI_HANDOFF: "1",
      },
    },
    {
      // No --seed: a fresh install. --mock-model stays on because there is no real model in e2e.
      name: "liv-fresh",
      command: `bun packages/liv/src/main.ts --port ${FRESH_LIV_PORT} --token ${FRESH_TOKEN} --mock-model --data-dir "${freshDataDir}" --app-source "${repoRoot}"`,
      cwd: repoRoot,
      url: `http://127.0.0.1:${FRESH_LIV_PORT}/health`,
      reuseExistingServer: false,
      timeout: 60_000,
      stdout: "pipe",
      stderr: "pipe",
      env: {
        LIV_SECRETS: "file",
        LIV_MOCK_DELAY_MS: "5",
        LIV_FAKE_CAMERAS: "[]",
      },
    },
    {
      name: "vite-fresh",
      command: `bunx vite --host 127.0.0.1 --port ${FRESH_VITE_PORT} --strictPort`,
      cwd: join(repoRoot, "apps/liv"),
      url: `http://127.0.0.1:${FRESH_VITE_PORT}`,
      reuseExistingServer: false,
      timeout: 120_000,
      stdout: "pipe",
      stderr: "pipe",
      env: {
        VITE_LIV_URL: `ws://127.0.0.1:${FRESH_LIV_PORT}/ws`,
        VITE_LIV_TOKEN: FRESH_TOKEN,
      },
    },
  ],
});
