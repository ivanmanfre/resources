import { chromium } from "playwright";
import pixelmatch from "pixelmatch";
import { PNG } from "pngjs";
import { writeFileSync } from "node:fs";

const VIEWPORT = { width: 1280, height: 1600 };

export async function captureToBuffer(url, opts) {
  const browser = await chromium.launch({ headless: true });
  try {
    const ctx = await browser.newContext({ viewport: VIEWPORT });
    const page = await ctx.newPage();
    // Block Google Fonts + tailwind CDN to keep diff focused on structure
    if (opts && opts.blockExternal) {
      await page.route("**/*", (route) => {
        const u = route.request().url();
        if (/fonts\.(googleapis|gstatic)\.com|cdn\.tailwindcss\.com/.test(u)) return route.abort();
        return route.continue();
      });
    }
    await page.goto(url, { waitUntil: "networkidle", timeout: 30000 });
    await page.waitForTimeout(800); // settle animations + reveal-on-scroll
    const buf = await page.screenshot({ fullPage: true, type: "png" });
    return buf;
  } finally {
    await browser.close();
  }
}

export function diffPngs(bufA, bufB, outPath) {
  const a = PNG.sync.read(bufA);
  const b = PNG.sync.read(bufB);
  const width = Math.min(a.width, b.width);
  const height = Math.min(a.height, b.height);
  const diff = new PNG({ width, height });
  // Crop both to same dims if mismatched
  function crop(png, w, h) {
    if (png.width === w && png.height === h) return png.data;
    const out = Buffer.alloc(w * h * 4);
    for (let y = 0; y < h; y++) {
      const srcStart = (y * png.width) * 4;
      const dstStart = (y * w) * 4;
      png.data.copy(out, dstStart, srcStart, srcStart + w * 4);
    }
    return out;
  }
  const dataA = crop(a, width, height);
  const dataB = crop(b, width, height);
  const numDiff = pixelmatch(dataA, dataB, diff.data, width, height, { threshold: 0.15, includeAA: true });
  if (outPath) writeFileSync(outPath, PNG.sync.write(diff));
  return { numDiff, totalPixels: width * height, pctDiff: (numDiff / (width * height)) * 100 };
}
