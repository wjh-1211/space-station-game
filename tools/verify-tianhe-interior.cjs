const { chromium } = require("playwright-core");
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const renderDir = path.join(root, "references", "render-review", "tianhe");
const chromePath = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const url = "http://127.0.0.1:5174/";

fs.mkdirSync(renderDir, { recursive: true });

async function enterTianhe(page) {
  await page.locator('.module-label[data-module-id="tianhe"]').evaluate((node) => node.click());
  await page.locator("#enter-tianhe").click();
  await page.waitForSelector("#interior-hud:not([hidden])");
  await page.waitForFunction(() => document.querySelector("#loading-screen")?.classList.contains("ready"));
  await page.waitForTimeout(450);
}

let browser;

(async () => {
  browser = await chromium.launch({
    executablePath: chromePath,
    headless: true,
    args: [
      "--use-angle=swiftshader",
      "--enable-webgl",
      "--ignore-gpu-blocklist",
      "--disable-background-timer-throttling",
      "--disable-backgrounding-occluded-windows",
      "--disable-renderer-backgrounding",
    ],
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  await page.bringToFront();
  const errors = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(url, { waitUntil: "networkidle" });
  await page.waitForFunction(() => document.querySelector("#loading-screen")?.classList.contains("ready"), undefined, { timeout: 30000 });
  await enterTianhe(page);
  await page.waitForFunction(() => document.querySelector("#interior-speed")?.getAttribute("data-position"));
  await page.screenshot({ path: path.join(renderDir, "tianhe-entry.png"), fullPage: true });
  const entryPosition = await page.locator("#interior-speed").getAttribute("data-position");
  const hudVisible = await page.locator("#interior-hud").isVisible();
  const entryHeaderHidden = await page.locator("#topbar").isHidden();

  await page.keyboard.down("w");
  await page.waitForTimeout(1800);
  await page.keyboard.up("w");
  await page.waitForTimeout(150);
  await page.screenshot({ path: path.join(renderDir, "tianhe-main-cabin.png"), fullPage: true });

  const cabinPosition = await page.locator("#interior-speed").getAttribute("data-position");
  const cabinHeaderHidden = await page.locator("#topbar").isHidden();
  const forwardMovementObserved = Number(cabinPosition?.split(",")[2]) < Number(entryPosition?.split(",")[2]) - 0.005;
  const result = {
    entryPosition,
    cabinPosition,
    forwardMovementObserved,
    hudVisible,
    exteriorHeaderHidden: entryHeaderHidden && cabinHeaderHidden,
    errors,
  };
  console.log(JSON.stringify(result, null, 2));
  if (!entryPosition || !cabinPosition || !forwardMovementObserved || !hudVisible || !result.exteriorHeaderHidden || errors.length > 0) {
    process.exitCode = 1;
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}).finally(async () => {
  await browser?.close();
});
