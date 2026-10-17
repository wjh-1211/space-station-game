const { chromium } = require("playwright-core");

(async () => {
  const browser = await chromium.launch({ headless: true, args: ["--allow-file-access-from-files"] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const src = "https://sns-video-qc.xhscdn.com/stream/79/110/258/01ea9d6b8673a91c4f037001a076eef056_258.mp4?sign=86d76afb4b1a90adf0da7da3e9bc18f1&t=6ad61220";
  await page.setContent(`<style>html,body{margin:0;background:#000}video{width:1280px;height:720px;object-fit:contain}</style><video src="${src}" muted></video>`);
  await page.waitForFunction(() => document.querySelector("video").readyState >= 2);
  for (const time of [1, 8, 16, 24, 32, 38]) {
    await page.evaluate(async (seekTime) => {
      const video = document.querySelector("video");
      video.currentTime = seekTime;
      await new Promise((resolve) => video.addEventListener("seeked", resolve, { once: true }));
    }, time);
    await page.screenshot({ path: `references/xhs-render-study/frame-${time}.png` });
  }
  console.log("frames=6");
  await browser.close();
})();
