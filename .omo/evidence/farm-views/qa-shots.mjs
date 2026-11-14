
const { chromium } = await import("/Users/kristianvastveit/projects/orbit/node_modules/.bun/@playwright+test@1.64.1/node_modules/@playwright/test/index.js");
const out = process.argv[2];
const base = "http://127.0.0.1:5193";
const results = [];
const browser = await chromium.launch();
try {
  for (const [label, viewport, mobile] of [["1440", { width: 1440, height: 900 }, false], ["390", { width: 390, height: 844 }, true]]) {
    for (const theme of ["light", "dark"]) {
      const context = await browser.newContext({ viewport, isMobile: mobile, hasTouch: mobile, deviceScaleFactor: mobile ? 2 : 1 });
      await context.addInitScript((t) => localStorage.setItem("orbit.theme", t), theme);
      const page = await context.newPage();
      const errors = [];
      page.on("console", (m) => { if (m.type() === "error") errors.push(m.text().slice(0, 200)); });
      page.on("pageerror", (e) => errors.push("pageerror: " + String(e).slice(0, 200)));
      const r = { label, theme };
      const shot = (name) => page.screenshot({ path: out + "/" + name + "-" + label + "-" + theme + ".png" });
      await page.goto(base + "/");
      for (const id of ["herd", "calendar", "cameras"]) await page.getByTestId("home-card-" + id).waitFor({ state: "visible" });
      const herdCard = page.frameLocator('[data-testid="home-card-frame-herd"]');
      await herdCard.getByTestId("herd-card-total").waitFor();
      r.homeTheme = await page.evaluate(() => document.documentElement.dataset.theme);
      r.herdCardTotal = (await herdCard.getByTestId("herd-card-total").textContent()).trim();
      r.herdCardAttention = (await herdCard.getByTestId("herd-card-attention").textContent()).trim();
      r.calendarNext = (await page.frameLocator('[data-testid="home-card-frame-calendar"]').getByTestId("calendar-card-next").textContent()).trim();
      r.camerasSummary = (await page.frameLocator('[data-testid="home-card-frame-cameras"]').getByTestId("cameras-card-summary").textContent()).trim();
      r.cardFrameTheme = await page.getByTestId("home-card-frame-herd").getAttribute("src");
      await page.getByTestId("home-cards").scrollIntoViewIfNeeded();
      await page.waitForTimeout(600);
      r.docScrollable = await page.evaluate(() => document.scrollingElement.scrollHeight > document.scrollingElement.clientHeight);
      r.overflowX = await page.evaluate(() => document.scrollingElement.scrollWidth > innerWidth);
      await shot("home");
      await page.getByTestId("home-card-link-herd").click();
      await page.waitForURL(/\/pages\/herd$/);
      const panel = page.frameLocator('[data-testid="custom-page-frame"]');
      await panel.getByTestId("herd-title").waitFor();
      await panel.getByTestId("animal-card").first().waitFor();
      r.herdCount = (await panel.getByTestId("herd-count").textContent()).trim();
      r.url = new URL(page.url()).pathname;
      await shot("herd");
      await panel.getByTestId("herd-filter-attention").click();
      r.attention = await panel.getByTestId("animal-card").evaluateAll((els) => els.map((e) => e.dataset.animalName).sort());
      await panel.getByTestId("herd-filter-all").click();
      await panel.getByTestId("herd-search").fill("bella");
      r.search = await panel.getByTestId("animal-card").count();
      await panel.getByTestId("animal-card").click();
      await panel.getByTestId("animal-panel-milk").waitFor();
      r.cow = { name: (await panel.getByTestId("animal-panel-name").textContent()).trim(), tag: (await panel.getByTestId("animal-panel-tag").textContent()).trim(), milk: (await panel.getByTestId("animal-panel-milk").textContent()).trim() };
      await shot("cow");
      await page.goto(base + "/pages/calendar");
      const cal = page.frameLocator('[data-testid="custom-page-frame"]');
      await cal.getByTestId("calendar-upcoming").locator('[data-testid="calendar-event"]').first().waitFor();
      r.upcoming = await cal.getByTestId("calendar-upcoming").locator('[data-testid="calendar-event"]').evaluateAll((els) => els.slice(0, 10).map((e) => e.dataset.type + ":" + e.dataset.animalName));
      await shot("calendar");
      await page.goto(base + "/pages/cameras");
      const wall = page.frameLocator('[data-testid="custom-page-frame"]');
      await wall.getByTestId("camera-view-tile").first().waitFor();
      r.cameras = { summary: (await wall.getByTestId("cameras-summary").textContent()).trim(), tiles: await wall.getByTestId("camera-view-tile").evaluateAll((els) => els.map((e) => e.dataset.cameraName + ":" + e.dataset.status)) };
      await page.waitForTimeout(800);
      await shot("cameras");
      r.errors = errors;
      results.push(r);
      await context.close();
    }
  }
} finally {
  await browser.close();
}
await Bun.write(out + "/results.json", JSON.stringify(results, null, 1));
console.log("QASHOTS done " + results.length);
