// QA driver: records the order and time of captions and tool rows during one typed voice turn.
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";

const SKILL = "/Users/kristianvastveit/.omo/binary-runtime/5.1.69/plugin/skills/browser";
const SHELL =
  "/Users/kristianvastveit/Library/Caches/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-mac-arm64/chrome-headless-shell";

const INSTALL = () => {
  const log = [];
  const seen = new Map();
  const t0 = performance.now();
  const push = (kind, key, value) => {
    if (seen.get(key) === value) return;
    seen.set(key, value);
    log.push({ ms: Math.round(performance.now() - t0), kind, value });
  };
  const scan = () => {
    const root = document.querySelector('[data-testid="home-orion-widget"]');
    if (!root) return;
    push("state", "state", root.getAttribute("data-voice-state"));
    root.querySelectorAll('[data-testid^="voice-caption-"]').forEach((el, i) => {
      push(el.getAttribute("data-testid"), `cap-${i}`, el.textContent.trim());
    });
    root.querySelectorAll('[data-testid="activity-row"]').forEach((el, i) => {
      push("row", `row-${i}`, `${el.getAttribute("data-status")} | ${el.textContent.trim()}`);
    });
    const dialog = document.querySelector('[data-testid="access-dialog"]');
    push("access-dialog", "dialog", dialog ? "open" : "closed");
  };
  new MutationObserver(scan).observe(document.body, {
    subtree: true,
    childList: true,
    attributes: true,
    characterData: true,
  });
  scan();
  window.__seq = log;
};

export async function runTurn({ app, runTmp, text, until, shotRunning, shotDone, allowAccess = false }) {
  const { loadOmowright } = await import(`${SKILL}/scripts/omowright.mjs`);
  const { omowright } = await loadOmowright();
  const profile = mkdtempSync(join(runTmp, "qa-profile-"));
  const browser = await omowright.connectPipe({
    browserPath: SHELL,
    browserArgs: [
      "--headless",
      "--no-first-run",
      "--window-size=1280,820",
      `--user-data-dir=${profile}`,
      "--use-fake-device-for-media-stream",
      "--use-fake-ui-for-media-stream",
    ],
    storageRoot: profile,
    dialogPolicy: { accept: true },
  });
  const poll = async (page, what, probe, arg, timeoutMs = 20000) => {
    const deadline = Date.now() + timeoutMs;
    let last;
    while (Date.now() < deadline) {
      last = await page.evaluate(probe, arg);
      if (last) return last;
      await new Promise((r) => setTimeout(r, 50));
    }
    throw new Error(`Timed out waiting for ${what}; log: ${JSON.stringify(await page.evaluate(() => window.__seq))}`);
  };
  try {
    const page = await browser.newTab(`${app}/`);
    await page.evaluate(() => {
      localStorage.setItem("orbit.locale", "en");
      localStorage.setItem("orbit.theme", "light");
    });
    await page.goto(`${app}/`);
    await poll(page, "start button", () => Boolean(document.querySelector('[data-testid="home-voice-start"]')));
    await page.evaluate(INSTALL);
    await page.locator('[data-testid="home-voice-start"]').click();
    await poll(page, "listening", () =>
      document.querySelector('[data-testid="home-orion-widget"]')?.getAttribute("data-voice-state") === "listening" &&
      window.__seq.some((e) => e.kind === "voice-caption-assistant"),
    );
    const mark = await page.evaluate(() => window.__seq.length);
    const input = '[data-testid="home-orion-widget"] [data-testid="voice-text-input"]';
    await page.locator(input).fill(text);
    await page.locator(input).press("Enter");
    if (shotRunning) {
      await poll(page, "a running row", () => window.__seq.some((e) => e.kind === "row" && e.value.startsWith("running")));
      await Bun.write(shotRunning, await page.screenshot());
    }
    if (allowAccess) {
      await poll(page, "access dialog", () => Boolean(document.querySelector('[data-testid="access-allow"]')));
      await page.locator('[data-testid="access-allow"]').click();
    }
    await poll(page, `text "${until}"`, (needle) => window.__seq.some((e) => e.kind === "voice-caption-assistant" && e.value.includes(needle)), until);
    await poll(page, "no running row", () =>
      ![...document.querySelectorAll('[data-testid="activity-row"]')].some((el) => el.getAttribute("data-status") === "running"),
    );
    if (shotDone) await Bun.write(shotDone, await page.screenshot());
    const log = await page.evaluate(() => window.__seq);
    return { text, turn: log.slice(mark), before: log.slice(0, mark) };
  } finally {
    await browser.close();
    rmSync(profile, { recursive: true, force: true });
  }
}
