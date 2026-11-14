// usage: bun phone.mjs <outDir>
import { chromium } from "/Users/kristianvastveit/projects/orbit/packages/e2e/node_modules/@playwright/test/index.mjs";
const outDir = process.argv[2];
const APP = "http://127.0.0.1:5231";
const HERD = "http://127.0.0.1:7831/pages/qa/herd/index.html";
const browser = await chromium.launch({ args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"] });
const results = {};
try {
  for (const theme of ["light", "dark"]) {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, permissions: ["microphone"] });
    await context.addInitScript((theme) => { localStorage.setItem("orbit.locale", "en"); localStorage.setItem("orbit.theme", theme); }, theme);
    const page = await context.newPage();
    const overflow = () => page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, innerWidth, overflows: document.documentElement.scrollWidth > innerWidth }));
    const r = {};
    await page.goto(APP + "/");
    const widget = page.getByTestId("home-orion-widget");
    await widget.getByTestId("home-voice-start").click();
    await widget.and(page.locator('[data-voice-state="listening"]')).waitFor();
    await widget.getByTestId("voice-text-input").fill("Who is in my herd?");
    await widget.getByTestId("voice-text-input").press("Enter");
    await widget.getByText("There are 28 animals in your herd.").waitFor();
    await widget.scrollIntoViewIfNeeded();
    r.home = { overflow: await overflow(), widget: await widget.boundingBox() };
    await page.screenshot({ path: outDir + "/phone-home-live-390-" + theme + ".png" });
    await widget.getByTestId("voice-end").click();

    await page.goto(APP + "/chat");
    await page.getByTestId("chat-voice-button").waitFor();
    await page.getByTestId("chat-voice-button").click();
    const stage = page.getByTestId("voice-stage");
    await stage.and(page.locator('[data-voice-state="listening"]')).waitFor();
    r.stage = { overflow: await overflow(), box: await stage.boundingBox(), orb: await stage.getByTestId("voice-orb").boundingBox(), paneVoice: await page.locator(".orbit-thread-pane").getAttribute("data-voice") };
    await page.screenshot({ path: outDir + "/phone-chat-stage-390-" + theme + ".png" });
    await page.getByTestId("chat-composer-input").fill("open " + HERD);
    await page.getByTestId("chat-composer-input").press("Enter");
    await page.getByTestId("browser-highlight").waitFor({ timeout: 45000 });
    await page.getByTestId("chat-transcript").getByText("marked where to start").waitFor({ timeout: 30000 });
    r.browser = { overflow: await overflow(), frame: await page.getByTestId("browser-view-frame").boundingBox(), transcript: await page.getByTestId("chat-transcript").boundingBox(), endVisible: await stage.getByTestId("voice-end").isVisible() };
    await page.screenshot({ path: outDir + "/phone-chat-browser-390-" + theme + ".png" });
    await stage.getByTestId("voice-end").click();
    results[theme] = r;
    await context.close();
  }
} finally {
  await browser.close();
}
console.log(JSON.stringify(results, null, 1));
