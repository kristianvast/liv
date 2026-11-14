import pw from "/Users/kristianvastveit/projects/orbit/node_modules/.bun/@playwright+test@1.64.1/node_modules/@playwright/test/index.js";
const { chromium } = pw;
import { mkdirSync, writeFileSync } from "node:fs";
const [base, label, mode, outDir] = process.argv.slice(2);
mkdirSync(outDir, { recursive: true });
const log = []; let fail = 0;
const check = (name, ok, detail = "") => { log.push(`${ok ? "PASS" : "FAIL"} ${name} ${detail}`); if (!ok) fail++; };
const browser = await chromium.launch();
const BANNED = ["devices-add-btn", "animal-drawer-attach-sensor-btn", "home-sensors-online"];
for (const [w, h] of [[1440, 900], [390, 844]]) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h } });
  const page = await ctx.newPage();
  for (const path of ["/", "/devices", "/herd", "/settings"]) {
    await page.goto(base + path, { waitUntil: "networkidle" });
    await page.waitForTimeout(800);
    const text = await page.locator("body").innerText();
    const shot = `${outDir}/${label}-${w}-${path === "/" ? "home" : path.slice(1)}.png`;
    await page.screenshot({ path: shot, fullPage: true });
    if (path === "/" || path === "/devices") check(`${w} ${path} no sensor wording`, !/sensor/i.test(text), (text.match(/.{0,30}sensor.{0,30}/i) ?? [""])[0]);
    check(`${w} ${path} no "Sensors & Robots"`, !text.includes("Sensors & Robots"));
    for (const id of BANNED) check(`${w} ${path} no ${id}`, (await page.getByTestId(id).count()) === 0);
    check(`${w} ${path} no device-attach-btn`, (await page.locator('[data-testid^="device-attach-btn"]').count()) === 0);
    if (path === "/" && mode === "seeded" && w === 1440) check("nav shows Connections", (await page.getByTestId("nav-module-devices").innerText().catch(() => "")).includes("Connections"));
    if (path === "/" && mode === "minimal") check(`${w} minimal home`, (await page.getByTestId("home-minimal").count()) === 1);
    if (path === "/devices" && mode === "minimal") check(`${w} no connector cards`, (await page.locator('[data-testid^="connector-card-"]').count()) === 0);
    if (path === "/devices" && mode === "seeded") log.push(`INFO ${w} connector cards: ${await page.locator('[data-testid^="connector-card-"]').count()}`);
    if (path === "/herd" && mode === "seeded" && w === 1440) {
      const row = page.locator('[data-testid^="herd-row-"], [data-testid^="animal-row-"], tbody tr').first();
      if (await row.count()) { await row.click().catch(() => {}); await page.waitForTimeout(600); await page.screenshot({ path: `${outDir}/${label}-${w}-herd-drawer.png` }); check("drawer no attach button", (await page.getByTestId("animal-drawer-attach-sensor-btn").count()) === 0); }
    }
  }
  await ctx.close();
}
await browser.close();
log.push(fail ? `RESULT FAIL (${fail})` : "RESULT PASS");
writeFileSync(`${outDir}/${label}-assertions.log`, log.join("\n") + "\n");
console.log(log.join("\n"));
process.exit(fail ? 1 : 0);
