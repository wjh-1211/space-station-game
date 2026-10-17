const { chromium } = require("playwright-core");
const path = require("path");

const root = path.resolve(__dirname, "..");
const chromePath = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const url = "http://127.0.0.1:5174/";

async function capture(viewport, fileName, verifyInteraction = false) {
  const browser = await chromium.launch({
    executablePath: chromePath,
    headless: true,
    args: ["--use-angle=swiftshader", "--enable-webgl", "--ignore-gpu-blocklist"],
  });
  const page = await browser.newPage({ viewport, deviceScaleFactor: 1 });
  const errors = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(url, { waitUntil: "networkidle" });
  await page.waitForSelector("#loading-screen.ready", { timeout: 30000 });
  await page.waitForTimeout(1200);
  await page.screenshot({ path: path.join(root, fileName), fullPage: true });

  const labels = await page.locator(".module-label").count();
  const orbitStatus = await page.locator("#orbit-status").textContent();
  const panelVisible = await page.locator("#module-panel").evaluate((node) => node.classList.contains("visible"));
  let interaction = null;
  if (verifyInteraction) {
    interaction = [];
    for (const name of ["天和核心舱", "问天实验舱", "梦天实验舱"]) {
      await page.locator(".module-label", { hasText: name }).evaluate((node) => node.click());
      await page.waitForFunction(
        (moduleName) => {
          const indicator = document.querySelector("#mode-indicator")?.textContent;
          const title = document.querySelector("#interior-title")?.textContent;
          return indicator === "舱段内部" && title?.startsWith(moduleName);
        },
        name,
        { timeout: 8000 },
      );
      const interiorVisible = await page.locator("#interior-toolbar").evaluate((node) => !node.classList.contains("hidden"));
      const interiorTitle = await page.locator("#interior-title").textContent();
      if (name === "问天实验舱") {
        await page.screenshot({ path: path.join(root, "station-v5-web-interior.png"), fullPage: true });
      }
      await page.locator("#back-button").click();
      await page.waitForFunction(
        () => document.querySelector("#mode-indicator")?.textContent === "外部总览",
        undefined,
        { timeout: 8000 },
      );
      await page.waitForTimeout(150);
      const returnedToOverview = await page.locator("#interior-toolbar").evaluate((node) => node.classList.contains("hidden"));
      interaction.push({ name, interiorTitle, interiorVisible, returnedToOverview });
    }
  }
  await browser.close();
  return { labels, orbitStatus, panelVisible, interaction, errors };
}

(async () => {
  const desktop = await capture({ width: 1440, height: 900 }, "station-v5-web-desktop.png", true);
  const mobile = await capture({ width: 390, height: 844 }, "station-v5-web-mobile.png");
  console.log(JSON.stringify({ desktop, mobile }, null, 2));
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
