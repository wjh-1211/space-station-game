const fs = require("fs");
const http = require("http");
const path = require("path");
const { chromium } = require("playwright-core");

const [, , inputArg, outputArg, fpsArg] = process.argv;
if (!inputArg || !outputArg) {
  console.error("Usage: node tools/extract-video-frames.cjs <video> <output-dir> [fps]");
  process.exit(1);
}

const inputPath = path.resolve(inputArg);
const outputDir = path.resolve(outputArg);
const sampleFps = Number(fpsArg || 30);
if (!fs.existsSync(inputPath)) throw new Error(`Video not found: ${inputPath}`);
if (!Number.isFinite(sampleFps) || sampleFps <= 0 || sampleFps > 60) {
  throw new Error("fps must be a number between 0 and 60");
}

fs.mkdirSync(outputDir, { recursive: true });

function contentType(filePath) {
  if (filePath.endsWith(".mp4")) return "video/mp4";
  if (filePath.endsWith(".jpg") || filePath.endsWith(".jpeg")) return "image/jpeg";
  return "application/octet-stream";
}

function startFileServer() {
  const root = path.dirname(inputPath);
  const server = http.createServer((request, response) => {
    const requested = decodeURIComponent((request.url || "/").slice(1));
    const filePath = path.resolve(root, requested);
    if (filePath !== inputPath || !fs.existsSync(filePath)) {
      response.writeHead(404);
      response.end();
      return;
    }

    const stat = fs.statSync(filePath);
    const range = request.headers.range;
    if (!range) {
      response.writeHead(200, {
        "Content-Length": stat.size,
        "Content-Type": contentType(filePath),
        "Accept-Ranges": "bytes",
        "Access-Control-Allow-Origin": "*",
      });
      fs.createReadStream(filePath).pipe(response);
      return;
    }

    const [startText, endText] = range.replace("bytes=", "").split("-");
    const start = Number(startText);
    const end = endText ? Number(endText) : stat.size - 1;
    response.writeHead(206, {
      "Content-Range": `bytes ${start}-${end}/${stat.size}`,
      "Content-Length": end - start + 1,
      "Content-Type": contentType(filePath),
      "Accept-Ranges": "bytes",
      "Access-Control-Allow-Origin": "*",
    });
    fs.createReadStream(filePath, { start, end }).pipe(response);
  });
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve(server)));
}

async function seekVideo(page, time) {
  await page.evaluate((nextTime) => {
    const video = document.querySelector("video");
    video.currentTime = nextTime;
  }, time);
  await page.waitForFunction(
    (expected) => Math.abs(document.querySelector("video").currentTime - expected) < 0.04,
    time,
  );
}

(async () => {
  const server = await startFileServer();
  const port = server.address().port;
  const browser = await chromium.launch({
    executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    headless: true,
    args: ["--autoplay-policy=no-user-gesture-required"],
  });

  try {
    const page = await browser.newPage({ viewport: { width: 720, height: 1280 } });
    await page.setContent(`
      <video id="video" preload="auto" muted playsinline></video>
      <canvas id="canvas" width="720" height="1280"></canvas>
    `);
    const metadata = await page.evaluate(async ({ port, fileName }) => {
      const video = document.querySelector("video");
      video.crossOrigin = "anonymous";
      video.src = `http://127.0.0.1:${port}/${encodeURIComponent(fileName)}`;
      await new Promise((resolve, reject) => {
        video.onloadedmetadata = resolve;
        video.onerror = () => reject(new Error(`Unable to decode video: ${video.error?.message || "unknown error"}`));
      });
      return { duration: video.duration, width: video.videoWidth, height: video.videoHeight };
    }, { port, fileName: path.basename(inputPath) });

    await page.evaluate(({ width, height }) => {
      const canvas = document.querySelector("canvas");
      canvas.width = width;
      canvas.height = height;
    }, metadata);

    const frameCount = Math.max(1, Math.ceil(metadata.duration * sampleFps));
    const manifest = {
      input: path.relative(process.cwd(), inputPath),
      durationSeconds: metadata.duration,
      sourceWidth: metadata.width,
      sourceHeight: metadata.height,
      sampleFps,
      frameCount,
      frames: [],
    };

    for (let index = 0; index < frameCount; index += 1) {
      const time = Math.min(index / sampleFps, Math.max(0, metadata.duration - 0.001));
      await seekVideo(page, time);
      const dataUrl = await page.evaluate(() => {
        const video = document.querySelector("video");
        const canvas = document.querySelector("canvas");
        canvas.getContext("2d").drawImage(video, 0, 0, canvas.width, canvas.height);
        return canvas.toDataURL("image/jpeg", 0.9);
      });
      const fileName = `frame-${String(index + 1).padStart(5, "0")}.jpg`;
      fs.writeFileSync(path.join(outputDir, fileName), Buffer.from(dataUrl.split(",")[1], "base64"));
      manifest.frames.push({ fileName, timeSeconds: Number(time.toFixed(3)) });
      if ((index + 1) % 30 === 0 || index + 1 === frameCount) {
        console.log(`Extracted ${index + 1}/${frameCount} frames`);
      }
    }

    fs.writeFileSync(path.join(outputDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
    console.log(JSON.stringify({ outputDir, ...manifest, frames: undefined }, null, 2));
  } finally {
    await browser.close();
    server.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
