const { chromium } = require("playwright-core");

const chromePath = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const url = "http://127.0.0.1:5174/";
const modules = ["天和核心舱", "问天实验舱", "梦天实验舱"];

(async () => {
  const browser = await chromium.launch({
    executablePath: chromePath,
    headless: true,
    args: ["--use-angle=swiftshader", "--enable-webgl", "--ignore-gpu-blocklist"],
  });
  const results = [];
  try {
    for (const name of modules) {
      const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
      const errors = [];
      page.on("console", (message) => {
        if (message.type() === "error") errors.push(message.text());
      });
      page.on("pageerror", (error) => errors.push(error.message));
      await page.goto(url, { waitUntil: "networkidle" });
      await page.waitForSelector("#loading-screen.ready", { timeout: 30000 });
      await page.locator(".module-label", { hasText: name }).click();
      await page.waitForFunction(
        (moduleName) => {
          const toolbar = document.querySelector("#interior-toolbar");
          const title = document.querySelector("#interior-title")?.textContent;
          return toolbar && !toolbar.classList.contains("hidden") && title?.startsWith(moduleName);
        },
        name,
        { timeout: 5000 },
      );
      const title = await page.locator("#interior-title").textContent();
      const entered = await page.locator("#interior-toolbar").evaluate((node) => !node.classList.contains("hidden"));
      await page.locator("#back-button").click();
      await page.waitForFunction(
        () => document.querySelector("#interior-toolbar")?.classList.contains("hidden"),
        undefined,
        { timeout: 5000 },
      );
      const returned = await page.locator("#interior-toolbar").evaluate((node) => node.classList.contains("hidden"));
      results.push({ name, title, entered, returned, errors });
      await page.close();
    }
  } finally {
    await browser.close();
  }
  console.log(JSON.stringify(results, null, 2));
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
