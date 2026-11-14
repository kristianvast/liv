import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";

const SKILL = "/Users/kristianvastveit/.omo/binary-runtime/5.1.69/plugin/skills/browser";
const SHELL =
  "/Users/kristianvastveit/Library/Caches/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-mac-arm64/chrome-headless-shell";

export const APP = "http://127.0.0.1:5231";
export const ORION = "127.0.0.1:7831";
export const TOKEN = "qa";

export async function openBrowser({ runTmp, mic = true }) {
  const { loadOmowright } = await import(`${SKILL}/scripts/omowright.mjs`);
  const { omowright } = await loadOmowright();
  const profile = mkdtempSync(join(runTmp, "qa-profile-"));
  const browser = await omowright.connectPipe({
    browserPath: SHELL,
    browserArgs: [
      "--headless",
      "--no-first-run",
      `--user-data-dir=${profile}`,
      ...(mic ? ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"] : []),
    ],
    storageRoot: profile,
    dialogPolicy: { accept: true },
  });
  const log = [];
  return {
    browser,
    profile,
    log,
    step(name, detail) {
      log.push({ at: new Date().toISOString(), name, detail });
    },
    async close() {
      await browser.close();
      rmSync(profile, { recursive: true, force: true });
    },
  };
}

export async function openApp(session, path = "/", { theme = "light" } = {}) {
  const page = await session.browser.newTab(`${APP}/`);
  await page.evaluate(
    ({ theme }) => {
      localStorage.setItem("orbit.locale", "en");
      localStorage.setItem("orbit.theme", theme);
    },
    { theme },
  );
  await page.goto(`${APP}${path}`);
  session.step("goto", `${APP}${path} (locale en, theme ${theme})`);
  return page;
}

export async function waitFor(page, description, probe, arg, { timeoutMs = 15000 } = {}) {
  const deadline = Date.now() + timeoutMs;
  let last;
  while (Date.now() < deadline) {
    last = await page.evaluate(probe, arg);
    if (last) return last;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out waiting for: ${description} (last value: ${JSON.stringify(last)})`);
}

export const attr = (page, testId, name) =>
  page.evaluate(
    ({ testId, name }) =>
      document.querySelector(`[data-testid="${testId}"]`)?.getAttribute(name) ?? null,
    { testId, name },
  );

export const rect = (page, testId) =>
  page.evaluate((testId) => {
    const el = document.querySelector(`[data-testid="${testId}"]`);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.x, y: r.y, width: r.width, height: r.height };
  }, testId);

export const textOf = (page, testId) =>
  page.evaluate(
    (testId) => document.querySelector(`[data-testid="${testId}"]`)?.textContent ?? null,
    testId,
  );

export async function say(page, rootTestId, text) {
  const selector = `[data-testid="${rootTestId}"] [data-testid="voice-text-input"]`;
  await page.locator(selector).fill(text);
  await page.locator(selector).press("Enter");
}

export async function shot(session, page, file) {
  await Bun.write(file, await page.screenshot());
  session.step("screenshot", file);
  return file;
}
