const { chromium } = require("playwright-core");
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const renderDir = path.join(root, "references", "render-review", "exterior");
const chromePath = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const url = "http://127.0.0.1:5174/";

fs.mkdirSync(renderDir, { recursive: true });

async function capture(viewport, fileName) {
  const browser = await chromium.launch({
    executablePath: chromePath,
    headless: true,
    args: ["--use-angle=swiftshader", "--enable-webgl", "--ignore-gpu-blocklist"],
  });
  try {
    const page = await browser.newPage({ viewport, deviceScaleFactor: 1 });
    const errors = [];
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(url, { waitUntil: "networkidle" });
    await page.waitForFunction(() => document.querySelector("#loading-screen")?.classList.contains("ready"), undefined, { timeout: 30000 });
    await page.waitForTimeout(1200);
    await page.screenshot({ path: path.join(renderDir, fileName), fullPage: true });

    const labels = await page.locator(".module-label").count();
    const orbitStatus = await page.locator("#orbit-status").textContent();
    const panelVisible = await page.locator("#module-panel").evaluate((node) => node.classList.contains("visible"));
    return { labels, orbitStatus, panelVisible, errors };
  } finally {
    await browser.close();
  }
}

(async () => {
  const desktop = await capture({ width: 1440, height: 900 }, "station-web-desktop.png");
  const mobile = await capture({ width: 390, height: 844 }, "station-web-mobile.png");
  console.log(JSON.stringify({ desktop, mobile }, null, 2));
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
